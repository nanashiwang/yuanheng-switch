#[cfg(test)]
use crate::model_capabilities::is_confirmed_text_only_model as confirmed_text_only_model;
use crate::model_capabilities::{image_input_capability_from_settings, ImageInputCapability};
use crate::provider::Provider;
use crate::proxy::error::ProxyError;
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageReader, Limits, Rgb, RgbImage};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::io::Cursor;

pub const UNSUPPORTED_IMAGE_MARKER: &str = "[Unsupported Image]";
pub const HISTORICAL_IMAGE_MARKER: &str =
    "[Historical image omitted after it was processed to reduce context usage]";
pub const DUPLICATE_IMAGE_MARKER: &str = "[Duplicate image omitted to reduce context usage]";
pub const MEDIA_BUDGET_IMAGE_MARKER: &str =
    "[Image omitted because the request exceeded the safe media budget]";

const IMAGE_COMPRESSION_THRESHOLD_BYTES: usize = 384 * 1024;
const MAX_IMAGE_EDGE: u32 = 1_600;
const MAX_IMAGE_DECODE_DIMENSION: u32 = 20_000;
const MAX_IMAGE_DECODE_ALLOC_BYTES: u64 = 192 * 1024 * 1024;
const MAX_SINGLE_EMBEDDED_IMAGE_BYTES: usize = 8 * 1024 * 1024;
const MAX_TOTAL_EMBEDDED_IMAGE_BYTES: usize = 4 * 1024 * 1024;
const JPEG_QUALITY: u8 = 82;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct MediaOptimizationStats {
    pub compressed_images: usize,
    pub duplicate_images: usize,
    pub budget_omitted_images: usize,
    pub original_bytes: usize,
    pub outbound_bytes: usize,
}

/// Optimize only embedded base64 images; remote URLs and file references pass through unchanged.
///
/// This runs on the per-provider request copy, so the local conversation remains untouched. It
/// compresses large current images, removes duplicates, then keeps the newest images inside a
/// conservative media budget. Unsupported or undecodable images remain unchanged unless their
/// embedded payload alone is too large to forward safely.
pub fn optimize_embedded_images_for_context(body: &mut Value) -> MediaOptimizationStats {
    let mut stats = MediaOptimizationStats::default();
    let mut seen = HashSet::new();

    visit_embedded_images_mut(body, &mut |block, text_type| {
        optimize_embedded_image_block(block, text_type, &mut seen, &mut stats)
    });

    enforce_embedded_image_budget(body, &mut stats);
    stats.outbound_bytes = embedded_image_usage(body).0;
    stats
}

/// Replace image blocks before sending when the routed model is text-only.
///
/// Two paths, both reached only when the caller's media-fallback switch is on:
/// - explicit capability from the provider config (modelCatalog / modalities) is
///   always trusted — it is declaration-driven, never a guess;
/// - the confirmed text-only registry is used for proactive replacement only
///   when `allow_heuristic` is true. This switch controls silent request-body
///   mutation, not the capability truth advertised by the Codex model catalog.
pub fn replace_images_for_text_only_model(
    body: &mut Value,
    provider: &Provider,
    allow_heuristic: bool,
) -> usize {
    if !contains_image_blocks(body) {
        return 0;
    }

    let model = body
        .get("model")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("");

    if image_input_capability_from_settings(&provider.settings_config, model, allow_heuristic)
        != ImageInputCapability::Unsupported
    {
        return 0;
    }

    replace_images_in_body(body)
}

pub fn contains_image_blocks(body: &Value) -> bool {
    messages_have_image_blocks(body) || responses_input_has_image_blocks(body.get("input"))
}

pub fn replace_image_blocks_with_marker(body: &mut Value) -> usize {
    replace_images_in_body(body)
}

/// Drop only images that are already behind the latest assistant turn.
///
/// The latest user/tool-result images must stay available for the next model
/// turn. Older images have already been consumed by an assistant response, so
/// retaining their base64 payloads on every subsequent request only refills the
/// context window and can make Claude Desktop's auto-compaction thrash.
pub fn replace_historical_image_blocks_with_marker(body: &mut Value) -> usize {
    let Some(messages) = body.get_mut("messages").and_then(Value::as_array_mut) else {
        return 0;
    };
    let Some(last_assistant_index) = messages
        .iter()
        .rposition(|message| message.get("role").and_then(Value::as_str) == Some("assistant"))
    else {
        return 0;
    };

    messages[..last_assistant_index]
        .iter_mut()
        .filter_map(|message| message.get_mut("content"))
        .map(|content| {
            replace_images_in_content_with_marker(content, "text", HISTORICAL_IMAGE_MARKER)
        })
        .sum()
}

#[derive(Debug, Clone, Copy)]
enum EmbeddedImageField {
    AnthropicSource,
    ImageUrlObject,
    ImageUrlString,
}

#[derive(Debug)]
struct EmbeddedBase64Image {
    field: EmbeddedImageField,
    data: String,
}

fn optimize_embedded_image_block(
    block: &mut Value,
    text_type: &str,
    seen: &mut HashSet<[u8; 32]>,
    stats: &mut MediaOptimizationStats,
) {
    let Some(embedded) = extract_embedded_base64_image(block) else {
        return;
    };
    let compact_data = if embedded.data.bytes().any(|byte| byte.is_ascii_whitespace()) {
        embedded
            .data
            .bytes()
            .filter(|byte| !byte.is_ascii_whitespace())
            .map(char::from)
            .collect::<String>()
    } else {
        embedded.data.clone()
    };
    let Ok(original) = BASE64_STANDARD.decode(compact_data.as_bytes()) else {
        return;
    };

    stats.original_bytes = stats.original_bytes.saturating_add(original.len());
    let digest: [u8; 32] = Sha256::digest(&original).into();
    if !seen.insert(digest) {
        replace_image_block_with_text_marker(block, text_type, DUPLICATE_IMAGE_MARKER);
        stats.duplicate_images += 1;
        return;
    }

    if let Some(compressed) = compress_embedded_image(&original) {
        write_embedded_base64_image(block, embedded.field, "image/jpeg", &compressed);
        stats.compressed_images += 1;
        return;
    }

    if original.len() > MAX_SINGLE_EMBEDDED_IMAGE_BYTES {
        replace_image_block_with_text_marker(block, text_type, MEDIA_BUDGET_IMAGE_MARKER);
        stats.budget_omitted_images += 1;
    }
}

fn compress_embedded_image(original: &[u8]) -> Option<Vec<u8>> {
    let mut reader = ImageReader::new(Cursor::new(original))
        .with_guessed_format()
        .ok()?;
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_DECODE_DIMENSION);
    limits.max_image_height = Some(MAX_IMAGE_DECODE_DIMENSION);
    limits.max_alloc = Some(MAX_IMAGE_DECODE_ALLOC_BYTES);
    reader.limits(limits);
    let decoded = reader.decode().ok()?;
    let (width, height) = decoded.dimensions();

    if original.len() < IMAGE_COMPRESSION_THRESHOLD_BYTES
        && width <= MAX_IMAGE_EDGE
        && height <= MAX_IMAGE_EDGE
    {
        return None;
    }

    let resized = if width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE {
        decoded.resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, FilterType::Lanczos3)
    } else {
        decoded
    };
    let rgb = flatten_onto_white(&resized);
    let mut encoded = Vec::new();
    JpegEncoder::new_with_quality(&mut encoded, JPEG_QUALITY)
        .encode_image(&DynamicImage::ImageRgb8(rgb))
        .ok()?;

    // Avoid replacing already-efficient JPEG/WebP payloads with a larger request.
    (encoded.len().saturating_mul(100) < original.len().saturating_mul(95)).then_some(encoded)
}

fn flatten_onto_white(image: &DynamicImage) -> RgbImage {
    let rgba = image.to_rgba8();
    let mut rgb = RgbImage::new(rgba.width(), rgba.height());
    for (x, y, pixel) in rgba.enumerate_pixels() {
        let alpha = u16::from(pixel[3]);
        let blend =
            |channel: u8| ((u16::from(channel) * alpha + 255 * (255 - alpha) + 127) / 255) as u8;
        rgb.put_pixel(
            x,
            y,
            Rgb([blend(pixel[0]), blend(pixel[1]), blend(pixel[2])]),
        );
    }
    rgb
}

fn extract_embedded_base64_image(block: &Value) -> Option<EmbeddedBase64Image> {
    if let Some(source) = block.get("source").and_then(Value::as_object) {
        if source.get("type").and_then(Value::as_str) == Some("base64") {
            return Some(EmbeddedBase64Image {
                field: EmbeddedImageField::AnthropicSource,
                data: source.get("data")?.as_str()?.to_string(),
            });
        }
    }

    match block.get("image_url")? {
        Value::Object(image_url) => {
            let (_, data) = parse_base64_data_url(image_url.get("url")?.as_str()?)?;
            Some(EmbeddedBase64Image {
                field: EmbeddedImageField::ImageUrlObject,
                data,
            })
        }
        Value::String(image_url) => {
            let (_, data) = parse_base64_data_url(image_url)?;
            Some(EmbeddedBase64Image {
                field: EmbeddedImageField::ImageUrlString,
                data,
            })
        }
        _ => None,
    }
}

fn parse_base64_data_url(url: &str) -> Option<(String, String)> {
    let payload = url.strip_prefix("data:")?;
    let (metadata, data) = payload.split_once(',')?;
    if !metadata
        .split(';')
        .skip(1)
        .any(|parameter| parameter.eq_ignore_ascii_case("base64"))
    {
        return None;
    }
    let media_type = metadata
        .split(';')
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or("image/png");
    Some((media_type.to_string(), data.to_string()))
}

fn write_embedded_base64_image(
    block: &mut Value,
    field: EmbeddedImageField,
    media_type: &str,
    bytes: &[u8],
) {
    let data = BASE64_STANDARD.encode(bytes);
    match field {
        EmbeddedImageField::AnthropicSource => {
            if let Some(source) = block.get_mut("source").and_then(Value::as_object_mut) {
                source.insert(
                    "media_type".to_string(),
                    Value::String(media_type.to_string()),
                );
                source.insert("data".to_string(), Value::String(data));
            }
        }
        EmbeddedImageField::ImageUrlObject => {
            if let Some(url) = block.pointer_mut("/image_url/url") {
                *url = Value::String(format!("data:{media_type};base64,{data}"));
            }
        }
        EmbeddedImageField::ImageUrlString => {
            if let Some(url) = block.get_mut("image_url") {
                *url = Value::String(format!("data:{media_type};base64,{data}"));
            }
        }
    }
}

fn enforce_embedded_image_budget(body: &mut Value, stats: &mut MediaOptimizationStats) {
    let (mut total_bytes, mut image_count) = embedded_image_usage(body);
    if total_bytes <= MAX_TOTAL_EMBEDDED_IMAGE_BYTES {
        return;
    }

    visit_embedded_images_mut(body, &mut |block, text_type| {
        let Some(bytes) = embedded_image_size(block) else {
            return;
        };
        let exceeds_single_limit = bytes > MAX_SINGLE_EMBEDDED_IMAGE_BYTES;
        let can_drop_older_image = total_bytes > MAX_TOTAL_EMBEDDED_IMAGE_BYTES && image_count > 1;
        if !exceeds_single_limit && !can_drop_older_image {
            return;
        }

        replace_image_block_with_text_marker(block, text_type, MEDIA_BUDGET_IMAGE_MARKER);
        total_bytes = total_bytes.saturating_sub(bytes);
        image_count = image_count.saturating_sub(1);
        stats.budget_omitted_images += 1;
    });
}

fn embedded_image_usage(body: &Value) -> (usize, usize) {
    let mut total_bytes = 0usize;
    let mut image_count = 0usize;
    visit_embedded_images(body, &mut |block| {
        if let Some(bytes) = embedded_image_size(block) {
            total_bytes = total_bytes.saturating_add(bytes);
            image_count += 1;
        }
    });
    (total_bytes, image_count)
}

fn embedded_image_size(block: &Value) -> Option<usize> {
    let data = extract_embedded_base64_image(block)?.data;
    let compact_len = data
        .bytes()
        .filter(|byte| !byte.is_ascii_whitespace())
        .count();
    let padding = data
        .bytes()
        .rev()
        .filter(|byte| !byte.is_ascii_whitespace())
        .take_while(|byte| *byte == b'=')
        .count()
        .min(2);
    Some((compact_len.saturating_mul(3) / 4usize).saturating_sub(padding))
}

fn visit_embedded_images(body: &Value, visitor: &mut impl FnMut(&Value)) {
    if let Some(messages) = body.get("messages").and_then(Value::as_array) {
        for content in messages.iter().filter_map(|message| message.get("content")) {
            visit_content_images(content, visitor);
        }
    }
    if let Some(input) = body.get("input") {
        visit_responses_input_images(input, visitor);
    }
}

fn visit_content_images(content: &Value, visitor: &mut impl FnMut(&Value)) {
    let Some(blocks) = content.as_array() else {
        return;
    };
    for block in blocks {
        if is_image_block_type(block.get("type").and_then(Value::as_str)) {
            visitor(block);
        }
        if let Some(nested) = block.get("content") {
            visit_content_images(nested, visitor);
        }
    }
}

fn visit_responses_input_images(input: &Value, visitor: &mut impl FnMut(&Value)) {
    match input {
        Value::Array(items) => {
            for item in items {
                visit_responses_input_images(item, visitor);
            }
        }
        Value::Object(_) => {
            if input.get("type").and_then(Value::as_str) == Some("input_image") {
                visitor(input);
            }
            if let Some(content) = input.get("content") {
                visit_content_images(content, visitor);
            }
        }
        _ => {}
    }
}

fn visit_embedded_images_mut(body: &mut Value, visitor: &mut impl FnMut(&mut Value, &str)) {
    if let Some(messages) = body.get_mut("messages").and_then(Value::as_array_mut) {
        for content in messages
            .iter_mut()
            .filter_map(|message| message.get_mut("content"))
        {
            visit_content_images_mut(content, "text", visitor);
        }
    }
    if let Some(input) = body.get_mut("input") {
        visit_responses_input_images_mut(input, visitor);
    }
}

fn visit_content_images_mut(
    content: &mut Value,
    text_type: &str,
    visitor: &mut impl FnMut(&mut Value, &str),
) {
    let Some(blocks) = content.as_array_mut() else {
        return;
    };
    for block in blocks {
        if is_image_block_type(block.get("type").and_then(Value::as_str)) {
            visitor(block, text_type);
        }
        if let Some(nested) = block.get_mut("content") {
            visit_content_images_mut(nested, text_type, visitor);
        }
    }
}

fn visit_responses_input_images_mut(input: &mut Value, visitor: &mut impl FnMut(&mut Value, &str)) {
    match input {
        Value::Array(items) => {
            for item in items {
                visit_responses_input_images_mut(item, visitor);
            }
        }
        Value::Object(_) => {
            if input.get("type").and_then(Value::as_str) == Some("input_image") {
                visitor(input, "input_text");
            }
            if let Some(content) = input.get_mut("content") {
                visit_content_images_mut(content, "input_text", visitor);
            }
        }
        _ => {}
    }
}

pub fn is_unsupported_image_error(error: &ProxyError) -> bool {
    let ProxyError::UpstreamError { status, body } = error else {
        return false;
    };

    if !matches!(*status, 400 | 415 | 422 | 501) {
        return false;
    }

    let Some(body) = body.as_deref() else {
        return false;
    };

    let message = extract_error_text(body);
    let message = message.to_ascii_lowercase();

    // 自证性表述：这类短语本身就断言了"仅接受文本"，属于模态拒绝，无需再要求
    // 错误提到 image/media 等字样——火山方舟等网关的报错是
    // "Model only support text input"，全程不出现 image（issue #5025）。
    // 国产网关的英文常缺三单 s，因此带 s / 不带 s 两种形式都要列。
    const TEXT_ONLY_SELF_EVIDENT_HINTS: &[&str] = &["only support text", "only supports text"];
    if TEXT_ONLY_SELF_EVIDENT_HINTS
        .iter()
        .any(|hint| message.contains(hint))
    {
        return true;
    }

    let mentions_image = message.contains("image")
        || message.contains("vision")
        || message.contains("multimodal")
        || message.contains("multi-modal")
        || message.contains("modality")
        || message.contains("modalities")
        || message.contains("media")
        || message.contains("attachment");

    if !mentions_image {
        return false;
    }

    const UNSUPPORTED_HINTS: &[&str] = &[
        "unsupported",
        "not supported",
        "does not support",
        "doesn't support",
        "do not support",
        "don't support",
        "text only",
        "text-only",
        "invalid content type",
        "invalid message content",
        "unknown variant",
        "unknown content type",
        "unrecognized content type",
        "cannot process",
        "cannot handle",
        "can't process",
        "can't handle",
        "unable to process",
    ];

    UNSUPPORTED_HINTS.iter().any(|hint| message.contains(hint))
}

fn content_has_image_blocks(content: &Value) -> bool {
    let Some(blocks) = content.as_array() else {
        return false;
    };

    blocks.iter().any(|block| {
        is_image_block_type(block.get("type").and_then(Value::as_str))
            || block.get("content").is_some_and(content_has_image_blocks)
    })
}

fn replace_images_in_body(body: &mut Value) -> usize {
    let message_replacements = body
        .get_mut("messages")
        .and_then(Value::as_array_mut)
        .map(|messages| {
            messages
                .iter_mut()
                .filter_map(|message| message.get_mut("content"))
                .map(replace_images_in_content)
                .sum()
        })
        .unwrap_or(0);

    message_replacements
        + body
            .get_mut("input")
            .map(replace_images_in_responses_input)
            .unwrap_or(0)
}

fn replace_images_in_content(content: &mut Value) -> usize {
    replace_images_in_content_with_text_type(content, "text")
}

fn replace_images_in_content_with_text_type(content: &mut Value, text_type: &str) -> usize {
    replace_images_in_content_with_marker(content, text_type, UNSUPPORTED_IMAGE_MARKER)
}

fn replace_images_in_content_with_marker(
    content: &mut Value,
    text_type: &str,
    marker: &str,
) -> usize {
    let Some(blocks) = content.as_array_mut() else {
        return 0;
    };

    let mut replaced = 0usize;
    for block in blocks {
        if is_image_block_type(block.get("type").and_then(Value::as_str)) {
            replace_image_block_with_text_marker(block, text_type, marker);
            replaced += 1;
            continue;
        }

        if let Some(nested_content) = block.get_mut("content") {
            replaced += replace_images_in_content_with_marker(nested_content, text_type, marker);
        }
    }

    replaced
}

fn messages_have_image_blocks(body: &Value) -> bool {
    body.get("messages")
        .and_then(Value::as_array)
        .is_some_and(|messages| {
            messages
                .iter()
                .filter_map(|message| message.get("content"))
                .any(content_has_image_blocks)
        })
}

fn responses_input_has_image_blocks(input: Option<&Value>) -> bool {
    match input {
        Some(Value::Array(items)) => items.iter().any(responses_input_item_has_image_blocks),
        Some(item @ Value::Object(_)) => responses_input_item_has_image_blocks(item),
        _ => false,
    }
}

fn responses_input_item_has_image_blocks(item: &Value) -> bool {
    if item.get("type").and_then(Value::as_str) == Some("input_image") {
        return true;
    }

    item.get("content").is_some_and(content_has_image_blocks)
}

fn replace_images_in_responses_input(input: &mut Value) -> usize {
    match input {
        Value::Array(items) => items
            .iter_mut()
            .map(replace_images_in_responses_input_item)
            .sum(),
        Value::Object(_) => replace_images_in_responses_input_item(input),
        _ => 0,
    }
}

fn replace_images_in_responses_input_item(item: &mut Value) -> usize {
    let mut replaced = 0usize;

    if item.get("type").and_then(Value::as_str) == Some("input_image") {
        replace_image_block_with_text_marker(item, "input_text", UNSUPPORTED_IMAGE_MARKER);
        replaced += 1;
    }

    if let Some(content) = item.get_mut("content") {
        replaced += replace_images_in_content_with_text_type(content, "input_text");
    }

    replaced
}

fn is_image_block_type(block_type: Option<&str>) -> bool {
    matches!(block_type, Some("image" | "image_url" | "input_image"))
}

fn replace_image_block_with_text_marker(block: &mut Value, text_type: &str, marker: &str) {
    let cache_control = block.get("cache_control").cloned();
    *block = json!({
        "type": text_type,
        "text": marker
    });
    if let (Some(cache_control), Some(object)) = (cache_control, block.as_object_mut()) {
        object.insert("cache_control".to_string(), cache_control);
    }
}

fn extract_error_text(body: &str) -> String {
    if let Ok(value) = serde_json::from_str::<Value>(body) {
        let candidates = [
            value.pointer("/error/message"),
            value.pointer("/message"),
            value.pointer("/detail"),
            value.pointer("/error"),
        ];
        if let Some(message) = candidates
            .into_iter()
            .flatten()
            .find_map(|value| value.as_str())
        {
            return message.to_string();
        }

        if let Ok(compact) = serde_json::to_string(&value) {
            return compact;
        }
    }

    body.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::Provider;
    use serde_json::json;

    fn provider(settings_config: Value) -> Provider {
        Provider {
            id: "test".to_string(),
            name: "Test".to_string(),
            settings_config,
            website_url: None,
            category: None,
            created_at: None,
            sort_index: None,
            notes: None,
            meta: None,
            icon: None,
            icon_color: None,
            in_failover_queue: false,
        }
    }

    #[test]
    fn keeps_images_when_model_capability_is_unknown() {
        let provider = provider(json!({}));
        let mut body = json!({
            "model": "unknown-model",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "text", "text": "look" },
                    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "abc" } }
                ]
            }]
        });

        let count = replace_images_for_text_only_model(&mut body, &provider, true);

        assert_eq!(count, 0);
        assert_eq!(body["messages"][0]["content"][1]["type"], "image");
    }

    #[test]
    fn confirmed_text_only_models_replace_images_before_send() {
        let provider = provider(json!({}));
        let mut body = json!({
            "model": "deepseek/deepseek-v4-pro",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "abc" } }
                ]
            }]
        });

        let count = replace_images_for_text_only_model(&mut body, &provider, true);

        assert_eq!(count, 1);
        assert_eq!(
            body["messages"][0]["content"][0]["text"],
            UNSUPPORTED_IMAGE_MARKER
        );
    }

    #[test]
    fn confirmed_text_only_models_replace_chat_image_url_before_send() {
        let provider = provider(json!({}));
        let mut body = json!({
            "model": "deepseek-v4-flash",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "text", "text": "look" },
                    { "type": "image_url", "image_url": { "url": "data:image/png;base64,abc" } }
                ]
            }]
        });

        let count = replace_images_for_text_only_model(&mut body, &provider, true);

        assert_eq!(count, 1);
        assert_eq!(body["messages"][0]["content"][1]["type"], "text");
        assert_eq!(
            body["messages"][0]["content"][1]["text"],
            UNSUPPORTED_IMAGE_MARKER
        );
    }

    #[test]
    fn confirmed_text_only_models_replace_codex_input_image_before_send() {
        let provider = provider(json!({}));
        let mut body = json!({
            "model": "deepseek-v4-flash",
            "input": [{
                "role": "user",
                "content": [
                    { "type": "input_text", "text": "look" },
                    { "type": "input_image", "image_url": "data:image/png;base64,abc" }
                ]
            }]
        });

        let count = replace_images_for_text_only_model(&mut body, &provider, true);

        assert_eq!(count, 1);
        assert_eq!(body["input"][0]["content"][1]["type"], "input_text");
        assert_eq!(
            body["input"][0]["content"][1]["text"],
            UNSUPPORTED_IMAGE_MARKER
        );
    }

    #[test]
    fn longcat_models_are_classified_text_only() {
        // LongCat-2.0 (like the retired Flash Chat) is a text-only model; the
        // preset ships it in mixed case, so the classifier must normalize first.
        assert!(confirmed_text_only_model("LongCat-2.0"));
        assert!(confirmed_text_only_model("longcat/LongCat-2.0"));
        assert!(confirmed_text_only_model("LongCat-Flash-Chat"));
    }

    #[test]
    fn explicit_text_modalities_replace_images_before_send() {
        let provider = provider(json!({
            "models": [
                { "id": "deepseek-v4-pro", "input": ["text"] }
            ]
        }));
        let mut body = json!({
            "model": "deepseek-v4-pro",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "text", "text": "look" },
                    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "abc" } }
                ]
            }]
        });

        let count = replace_images_for_text_only_model(&mut body, &provider, true);

        assert_eq!(count, 1);
        assert_eq!(body["messages"][0]["content"][0]["text"], "look");
        assert_eq!(body["messages"][0]["content"][1]["type"], "text");
        assert_eq!(
            body["messages"][0]["content"][1]["text"],
            UNSUPPORTED_IMAGE_MARKER
        );
    }

    #[test]
    fn preserves_images_without_explicit_capability_even_for_unknown_models() {
        let provider = provider(json!({}));
        let mut body = json!({
            "model": "unknown-model",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "abc" } }
                ]
            }]
        });

        let count = replace_images_for_text_only_model(&mut body, &provider, true);

        assert_eq!(count, 0);
        assert_eq!(body["messages"][0]["content"][0]["type"], "image");
    }

    #[test]
    fn explicit_text_modalities_can_override_visual_model_ids() {
        let provider = provider(json!({
            "models": [
                { "id": "gpt-4o", "input": ["text"] }
            ]
        }));
        let mut body = json!({
            "model": "gpt-4o",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "abc" } }
                ]
            }]
        });

        let count = replace_images_for_text_only_model(&mut body, &provider, true);

        assert_eq!(count, 1);
        assert_eq!(
            body["messages"][0]["content"][0]["text"],
            UNSUPPORTED_IMAGE_MARKER
        );
    }

    #[test]
    fn explicit_image_modalities_preserve_model_images() {
        let provider = provider(json!({
            "modelCatalog": {
                "models": [
                    { "model": "deepseek-v4-pro", "modalities": { "input": ["text", "image"] } }
                ]
            }
        }));
        let mut body = json!({
            "model": "deepseek-v4-pro",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "abc" } }
                ]
            }]
        });

        let count = replace_images_for_text_only_model(&mut body, &provider, true);

        assert_eq!(count, 0);
        assert_eq!(body["messages"][0]["content"][0]["type"], "image");
    }

    #[test]
    fn known_mimo_pro_replaces_but_mimo_multimodal_preserves() {
        let provider = provider(json!({}));
        let mut pro_body = json!({
            "model": "xiaomi-mimo-token-plan/mimo-v2.5-pro",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "abc" } }
                ]
            }]
        });
        let mut multimodal_body = json!({
            "model": "xiaomi-mimo-token-plan/mimo-v2.5",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "abc" } }
                ]
            }]
        });

        let pro_count = replace_images_for_text_only_model(&mut pro_body, &provider, true);
        let multimodal_count =
            replace_images_for_text_only_model(&mut multimodal_body, &provider, true);

        assert_eq!(pro_count, 1);
        assert_eq!(multimodal_count, 0);
        assert_eq!(
            multimodal_body["messages"][0]["content"][0]["type"],
            "image"
        );
    }

    #[test]
    fn multimodal_kimi_model_is_not_on_text_only_list() {
        let provider = provider(json!({}));
        let mut body = json!({
            "model": "kimi/kimi-k2.6",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "abc" } }
                ]
            }]
        });

        let count = replace_images_for_text_only_model(&mut body, &provider, true);

        assert_eq!(count, 0);
        assert_eq!(body["messages"][0]["content"][0]["type"], "image");
    }

    #[test]
    fn confirmed_text_only_variant_replaces_images_before_send() {
        let provider = provider(json!({}));
        let mut body = json!({
            "model": "therouter/qwen/qwen3-coder-480b",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "abc" } }
                ]
            }]
        });

        let count = replace_images_for_text_only_model(&mut body, &provider, true);

        assert_eq!(count, 1);
        assert_eq!(
            body["messages"][0]["content"][0]["text"],
            UNSUPPORTED_IMAGE_MARKER
        );
    }

    #[test]
    fn unconditional_marker_replacement_handles_retry_path() {
        let mut body = json!({
            "model": "xiaomi-mimo-token-plan/mimo-v2.5-pro",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "abc" } }
                ]
            }]
        });

        assert!(contains_image_blocks(&body));
        let count = replace_image_blocks_with_marker(&mut body);

        assert_eq!(count, 1);
        assert_eq!(
            body["messages"][0]["content"][0]["text"],
            UNSUPPORTED_IMAGE_MARKER
        );
    }

    #[test]
    fn replaces_nested_tool_result_image_blocks() {
        let mut body = json!({
            "model": "deepseek-v4-pro",
            "messages": [{
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": "toolu_1",
                    "content": [
                        { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "abc" } }
                    ]
                }]
            }]
        });

        let count = replace_image_blocks_with_marker(&mut body);

        assert_eq!(count, 1);
        assert_eq!(
            body["messages"][0]["content"][0]["content"][0]["text"],
            UNSUPPORTED_IMAGE_MARKER
        );
    }

    #[test]
    fn detects_unsupported_image_errors() {
        let error = ProxyError::UpstreamError {
            status: 400,
            body: Some(
                r#"{"error":{"message":"This model does not support image input"}}"#.to_string(),
            ),
        };

        assert!(is_unsupported_image_error(&error));
    }

    #[test]
    fn detects_text_only_errors_without_image_mention() {
        // 火山方舟真实报错（issue #5025）：不含 image/media 等字样，且英文缺
        // 三单 s——旧逻辑的 mentions_image 门与 "only supports text" 提示都拦不住。
        let error = ProxyError::UpstreamError {
            status: 400,
            body: Some(
                r#"{"error":{"message":"Model only support text input Request id: 021783"}}"#
                    .to_string(),
            ),
        };

        assert!(is_unsupported_image_error(&error));
    }

    #[test]
    fn glm_52_is_classified_text_only() {
        // issue #5025：火山 Coding Plan 的 GLM 5.2 是纯文本端点，
        // 映射链 glm-5.2[1M] 归一化后尾部为 glm-5.2。
        assert!(confirmed_text_only_model("glm-5.2"));
        assert!(confirmed_text_only_model("GLM-5.2[1M]"));
        assert!(confirmed_text_only_model("zai-org/GLM-5.2"));
        // 未来视觉版（智谱 4v/5v 命名惯例）不能被误判为纯文本。
        assert!(!confirmed_text_only_model("glm-5.2v"));
    }

    #[test]
    fn ignores_non_image_errors() {
        let error = ProxyError::UpstreamError {
            status: 400,
            body: Some(r#"{"error":{"message":"Invalid API key"}}"#.to_string()),
        };

        assert!(!is_unsupported_image_error(&error));
    }

    #[test]
    fn preserves_cache_control_when_replacing_image() {
        // image block 可能承载 prompt cache 断点；替换成标记时必须把
        // cache_control 迁移到新的 text block，否则会断掉缓存命中。
        let mut body = json!({
            "model": "deepseek-v4-pro",
            "messages": [{
                "role": "user",
                "content": [{
                    "type": "image",
                    "source": { "type": "base64", "media_type": "image/png", "data": "abc" },
                    "cache_control": { "type": "ephemeral" }
                }]
            }]
        });

        let count = replace_image_blocks_with_marker(&mut body);

        assert_eq!(count, 1);
        let block = &body["messages"][0]["content"][0];
        assert_eq!(block["type"], "text");
        assert_eq!(block["text"], UNSUPPORTED_IMAGE_MARKER);
        assert_eq!(block["cache_control"]["type"], "ephemeral");
    }

    #[test]
    fn detects_media_and_attachment_error_phrasings() {
        let media_error = ProxyError::UpstreamError {
            status: 400,
            body: Some(
                r#"{"error":{"message":"This model cannot process media inputs"}}"#.to_string(),
            ),
        };
        assert!(is_unsupported_image_error(&media_error));

        let attachment_error = ProxyError::UpstreamError {
            status: 422,
            body: Some(r#"{"message":"attachments are not supported by this model"}"#.to_string()),
        };
        assert!(is_unsupported_image_error(&attachment_error));
    }

    #[test]
    fn detects_chat_content_unknown_variant_image_url_errors() {
        let error = ProxyError::UpstreamError {
            status: 400,
            body: Some(
                r#"{"error":{"message":"Failed to deserialize the JSON body into the target type: messages[11]: unknown variant image_url, expected text"}}"#
                    .to_string(),
            ),
        };

        assert!(is_unsupported_image_error(&error));
    }

    #[test]
    fn heuristic_disabled_keeps_images_for_listed_text_only_models() {
        // allow_heuristic = false：内置列表不再预测性剥图，避免误判多模态模型时静默丢图。
        let provider = provider(json!({}));
        let mut body = json!({
            "model": "deepseek/deepseek-v4-pro",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "abc" } }
                ]
            }]
        });

        let count = replace_images_for_text_only_model(&mut body, &provider, false);

        assert_eq!(count, 0);
        assert_eq!(body["messages"][0]["content"][0]["type"], "image");
    }

    #[test]
    fn explicit_text_capability_replaces_even_when_heuristic_disabled() {
        // 显式声明 text-only 是声明驱动、零误判，即使关掉启发式也应生效。
        let provider = provider(json!({
            "models": [
                { "id": "deepseek-v4-pro", "input": ["text"] }
            ]
        }));
        let mut body = json!({
            "model": "deepseek-v4-pro",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "abc" } }
                ]
            }]
        });

        let count = replace_images_for_text_only_model(&mut body, &provider, false);

        assert_eq!(count, 1);
        assert_eq!(
            body["messages"][0]["content"][0]["text"],
            UNSUPPORTED_IMAGE_MARKER
        );
    }

    #[test]
    fn replaces_only_images_already_processed_by_an_assistant_turn() {
        let mut body = json!({
            "messages": [
                {
                    "role": "assistant",
                    "content": [{"type": "tool_use", "name": "Read"}]
                },
                {
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "content": [{
                            "type": "image",
                            "source": {"type": "base64", "data": "old-image"}
                        }]
                    }]
                },
                {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "I inspected the old image."}]
                },
                {
                    "role": "user",
                    "content": [{
                        "type": "image",
                        "source": {"type": "base64", "data": "current-image"}
                    }]
                }
            ]
        });

        let count = replace_historical_image_blocks_with_marker(&mut body);

        assert_eq!(count, 1);
        assert_eq!(
            body["messages"][1]["content"][0]["content"][0]["text"],
            HISTORICAL_IMAGE_MARKER
        );
        assert_eq!(body["messages"][3]["content"][0]["type"], "image");
    }

    #[test]
    fn keeps_images_when_no_assistant_has_processed_them() {
        let mut body = json!({
            "messages": [{
                "role": "user",
                "content": [{
                    "type": "image",
                    "source": {"type": "base64", "data": "current-image"}
                }]
            }]
        });

        assert_eq!(replace_historical_image_blocks_with_marker(&mut body), 0);
        assert_eq!(body["messages"][0]["content"][0]["type"], "image");
    }

    fn png_bytes(width: u32, height: u32) -> Vec<u8> {
        let image = RgbImage::from_pixel(width, height, Rgb([32, 128, 224]));
        let mut output = Cursor::new(Vec::new());
        DynamicImage::ImageRgb8(image)
            .write_to(&mut output, image::ImageFormat::Png)
            .unwrap();
        output.into_inner()
    }

    #[test]
    fn compresses_large_current_anthropic_image_without_touching_conversation_shape() {
        let original = png_bytes(2_400, 1_200);
        let mut body = json!({
            "messages": [{
                "role": "user",
                "content": [{
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": BASE64_STANDARD.encode(&original)
                    },
                    "cache_control": {"type": "ephemeral"}
                }]
            }]
        });

        let stats = optimize_embedded_images_for_context(&mut body);

        assert_eq!(stats.compressed_images, 1);
        assert_eq!(stats.duplicate_images, 0);
        let block = &body["messages"][0]["content"][0];
        assert_eq!(block["type"], "image");
        assert_eq!(block["source"]["media_type"], "image/jpeg");
        assert_eq!(block["cache_control"]["type"], "ephemeral");
        let compressed = BASE64_STANDARD
            .decode(block["source"]["data"].as_str().unwrap())
            .unwrap();
        let decoded = image::load_from_memory(&compressed).unwrap();
        assert!(decoded.width() <= MAX_IMAGE_EDGE);
        assert!(decoded.height() <= MAX_IMAGE_EDGE);
        assert!(compressed.len() < original.len());
    }

    #[test]
    fn removes_duplicate_current_images_but_keeps_the_first_copy() {
        let image = BASE64_STANDARD.encode(png_bytes(64, 64));
        let mut body = json!({
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image}},
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image}}
                ]
            }]
        });

        let stats = optimize_embedded_images_for_context(&mut body);

        assert_eq!(stats.duplicate_images, 1);
        assert_eq!(body["messages"][0]["content"][0]["type"], "image");
        assert_eq!(body["messages"][0]["content"][1]["type"], "text");
        assert_eq!(
            body["messages"][0]["content"][1]["text"],
            DUPLICATE_IMAGE_MARKER
        );
    }

    #[test]
    fn media_budget_drops_oldest_payload_and_preserves_newest_image() {
        let first = BASE64_STANDARD.encode(vec![1u8; 3 * 1024 * 1024]);
        let second = BASE64_STANDARD.encode(vec![2u8; 3 * 1024 * 1024]);
        let mut body = json!({
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": first}},
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": second}}
                ]
            }]
        });

        let stats = optimize_embedded_images_for_context(&mut body);

        assert_eq!(stats.budget_omitted_images, 1);
        assert_eq!(body["messages"][0]["content"][0]["type"], "text");
        assert_eq!(
            body["messages"][0]["content"][0]["text"],
            MEDIA_BUDGET_IMAGE_MARKER
        );
        assert_eq!(body["messages"][0]["content"][1]["type"], "image");
        assert_eq!(stats.outbound_bytes, 3 * 1024 * 1024);
    }

    #[test]
    fn preserves_remote_image_urls_without_downloading_them() {
        let mut body = json!({
            "input": [{
                "role": "user",
                "content": [{
                    "type": "input_image",
                    "image_url": "https://example.com/private-signed-image.png"
                }]
            }]
        });

        let stats = optimize_embedded_images_for_context(&mut body);

        assert_eq!(stats, MediaOptimizationStats::default());
        assert_eq!(
            body["input"][0]["content"][0]["image_url"],
            "https://example.com/private-signed-image.png"
        );
    }
}
