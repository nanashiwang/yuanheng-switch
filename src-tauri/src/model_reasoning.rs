use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const REASONING_LEVELS: &[&str] = &[
    "none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra",
];

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningProfile {
    pub supported_levels: Vec<String>,
    pub default_level: Option<String>,
}

pub fn normalize_reasoning_level(value: &str) -> Option<String> {
    let value = value.trim().to_ascii_lowercase();
    REASONING_LEVELS.contains(&value.as_str()).then_some(value)
}

pub fn normalize_reasoning_levels(values: impl IntoIterator<Item = String>) -> Vec<String> {
    let values = values
        .into_iter()
        .filter_map(|value| normalize_reasoning_level(&value))
        .collect::<Vec<_>>();
    REASONING_LEVELS
        .iter()
        .filter(|level| values.iter().any(|value| value == **level))
        .map(|level| (*level).to_string())
        .collect()
}

fn profile(levels: &[&str], default: &str) -> ReasoningProfile {
    ReasoningProfile {
        supported_levels: levels.iter().map(|level| (*level).to_string()).collect(),
        default_level: Some(default.to_string()),
    }
}

pub fn fallback_reasoning_profile(model: &str) -> Option<ReasoningProfile> {
    let model = model.trim().to_ascii_lowercase();
    if model == "gpt-5.6-sol" {
        return Some(profile(
            &["low", "medium", "high", "xhigh", "max", "ultra"],
            "low",
        ));
    }
    if model.contains("claude") {
        return Some(profile(&["low", "medium", "high", "max"], "medium"));
    }
    if model.starts_with("gpt-")
        || model.starts_with("o1")
        || model.starts_with("o3")
        || model.starts_with("o4")
        || model.contains("codex")
        || model == "k3"
    {
        return Some(profile(&["low", "medium", "high", "xhigh"], "medium"));
    }
    if model.contains("gemini") {
        return Some(profile(&["low", "medium", "high"], "medium"));
    }
    None
}

fn profile_from_catalog_entry(entry: &Value) -> Option<(String, ReasoningProfile)> {
    let slug = entry.get("slug")?.as_str()?.trim();
    if slug.is_empty() {
        return None;
    }
    let levels = entry
        .get("supported_reasoning_levels")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            item.get("effort")
                .and_then(Value::as_str)
                .or_else(|| item.as_str())
                .map(str::to_string)
        });
    let supported_levels = normalize_reasoning_levels(levels);
    if supported_levels.is_empty() {
        return None;
    }
    let default_level = entry
        .get("default_reasoning_level")
        .and_then(Value::as_str)
        .and_then(normalize_reasoning_level)
        .filter(|level| supported_levels.contains(level))
        .or_else(|| supported_levels.first().cloned());
    Some((
        slug.to_ascii_lowercase(),
        ReasoningProfile {
            supported_levels,
            default_level,
        },
    ))
}

fn catalog_priority(path: &Path) -> usize {
    match path.file_name().and_then(|name| name.to_str()) {
        Some("model-catalog.cn-meta-api.json") => 0,
        Some(name) if name.starts_with("model-catalog.") => 1,
        Some("models_cache.json") => 2,
        _ => 3,
    }
}

pub fn load_local_reasoning_profiles() -> HashMap<String, ReasoningProfile> {
    let codex_dir = crate::config::get_home_dir().join(".codex");
    let Ok(entries) = fs::read_dir(codex_dir) else {
        return HashMap::new();
    };
    let mut paths = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default();
            path.is_file()
                && name.ends_with(".json")
                && (name.starts_with("model-catalog.") || name == "models_cache.json")
        })
        .collect::<Vec<_>>();
    paths.sort_by_key(|path| catalog_priority(path));

    let mut result = HashMap::new();
    for path in paths {
        let Ok(text) = fs::read_to_string(path) else {
            continue;
        };
        let Ok(catalog) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        let Some(models) = catalog.get("models").and_then(Value::as_array) else {
            continue;
        };
        for entry in models {
            if let Some((slug, profile)) = profile_from_catalog_entry(entry) {
                result.entry(slug).or_insert(profile);
            }
        }
    }
    result
}

pub fn reasoning_profile_for_model(
    model: &str,
    catalog: &HashMap<String, ReasoningProfile>,
) -> Option<ReasoningProfile> {
    catalog
        .get(&model.trim().to_ascii_lowercase())
        .cloned()
        .or_else(|| fallback_reasoning_profile(model))
}

pub fn effective_reasoning_level(model: &str, selected: &str) -> Option<String> {
    if selected.trim() != "auto" && !selected.trim().is_empty() {
        return normalize_reasoning_level(selected);
    }
    let catalog = load_local_reasoning_profiles();
    reasoning_profile_for_model(model, &catalog)?.default_level
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_canonical_level_order() {
        assert_eq!(
            normalize_reasoning_levels(
                ["ultra", "low", "high", "low", "invalid"]
                    .into_iter()
                    .map(str::to_string)
            ),
            vec!["low", "high", "ultra"]
        );
    }

    #[test]
    fn gives_gpt_5_6_its_full_fallback_profile() {
        let profile = fallback_reasoning_profile("gpt-5.6-sol").unwrap();
        assert_eq!(profile.default_level.as_deref(), Some("low"));
        assert_eq!(
            profile.supported_levels,
            vec!["low", "medium", "high", "xhigh", "max", "ultra"]
        );
    }

    #[test]
    fn unknown_models_do_not_claim_adjustable_reasoning() {
        assert!(fallback_reasoning_profile("ocr-specialist").is_none());
    }
}
