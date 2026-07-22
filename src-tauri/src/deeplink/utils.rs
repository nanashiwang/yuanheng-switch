//! Deep link utility functions
//!
//! Common helpers for Base64 decoding.

use crate::error::AppError;
use base64::prelude::*;

/// Decode a Base64 parameter from deep link URL
///
/// This function handles common issues with Base64 in URLs:
/// - `+` being decoded as space
/// - Missing padding `=`
/// - Both standard and URL-safe Base64 variants
pub fn decode_base64_param(field: &str, raw: &str) -> Result<Vec<u8>, AppError> {
    let mut candidates: Vec<String> = Vec::new();
    // Keep spaces (to restore `+`), but remove newlines
    let trimmed = raw.trim_matches(|c| c == '\r' || c == '\n');

    // First try restoring spaces to "+"
    if trimmed.contains(' ') {
        let replaced = trimmed.replace(' ', "+");
        if !replaced.is_empty() && !candidates.contains(&replaced) {
            candidates.push(replaced);
        }
    }

    // Original value
    if !trimmed.is_empty() && !candidates.contains(&trimmed.to_string()) {
        candidates.push(trimmed.to_string());
    }

    // Add padding variants
    let existing = candidates.clone();
    for candidate in existing {
        let mut padded = candidate.clone();
        let remainder = padded.len() % 4;
        if remainder != 0 {
            padded.extend(std::iter::repeat_n('=', 4 - remainder));
        }
        if !candidates.contains(&padded) {
            candidates.push(padded);
        }
    }

    let mut last_error: Option<String> = None;
    for candidate in candidates {
        for engine in [
            &BASE64_STANDARD,
            &BASE64_STANDARD_NO_PAD,
            &BASE64_URL_SAFE,
            &BASE64_URL_SAFE_NO_PAD,
        ] {
            match engine.decode(&candidate) {
                Ok(bytes) => return Ok(bytes),
                Err(err) => last_error = Some(err.to_string()),
            }
        }
    }

    Err(AppError::InvalidInput(format!(
        "{field} 参数 Base64 解码失败：{}。请确认链接参数已用 Base64 编码并经过 URL 转义（尤其是将 '+' 编码为 %2B，或使用 URL-safe Base64）。",
        last_error.unwrap_or_else(|| "未知错误".to_string())
    )))
}
