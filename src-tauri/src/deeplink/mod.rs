//! Deep link import functionality for YuanHeng Switch
//!
//! This module implements the yuanhengswitch:// protocol for importing configurations
//! via deep links. Supports importing:
//! - MCP server configurations
//! - Prompts
//! - Skills
//!

mod mcp;
mod parser;
mod prompt;
mod skill;
mod utils;

#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};

// Re-export public API
pub use mcp::import_mcp_from_deeplink;
pub use parser::parse_deeplink_url;
pub use prompt::import_prompt_from_deeplink;
pub use skill::import_skill_from_deeplink;

/// Deep link import request model
///
/// Represents a parsed yuanhengswitch:// URL ready for processing.
/// This struct contains all possible fields for all resource types.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepLinkImportRequest {
    /// Protocol version (e.g., "v1")
    pub version: String,
    /// Resource type to import: "prompt" | "mcp" | "skill"
    pub resource: String,

    // ============ Common fields ============
    /// Target application for prompt and skill resources.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app: Option<String>,
    /// Resource name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Whether to enable after import (default: false)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,

    // ============ Prompt-specific fields ============
    /// Base64 encoded Markdown content
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// Prompt description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    // ============ MCP-specific fields ============
    /// Target applications for MCP (comma-separated: "claude,codex,gemini")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apps: Option<String>,

    // ============ Skill-specific fields ============
    /// GitHub repository (format: "owner/name")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo: Option<String>,
    /// Skill directory name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub directory: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,

    // ============ Config file fields (v3.8+) ============
    /// Base64 encoded config content
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<String>,
    /// Config format (json/toml)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config_format: Option<String>,
}
