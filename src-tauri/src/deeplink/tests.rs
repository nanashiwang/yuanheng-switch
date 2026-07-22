//! Deep link module tests

use super::mcp::parse_mcp_apps;
use super::parser::parse_deeplink_url;
use super::prompt::import_prompt_from_deeplink;
use crate::{store::AppState, Database};
use base64::prelude::*;
use std::{env, ffi::OsString, sync::Arc};

struct TestHomeGuard {
    _dir: tempfile::TempDir,
    original_home: Option<OsString>,
    original_userprofile: Option<OsString>,
    original_test_home: Option<OsString>,
}

impl TestHomeGuard {
    fn new() -> Self {
        let dir = tempfile::tempdir().expect("create isolated test home");
        let original_home = env::var_os("HOME");
        let original_userprofile = env::var_os("USERPROFILE");
        let original_test_home = env::var_os("YUANHENG_SWITCH_TEST_HOME");
        env::set_var("HOME", dir.path());
        env::set_var("USERPROFILE", dir.path());
        env::set_var("YUANHENG_SWITCH_TEST_HOME", dir.path());
        Self {
            _dir: dir,
            original_home,
            original_userprofile,
            original_test_home,
        }
    }
}

impl Drop for TestHomeGuard {
    fn drop(&mut self) {
        match &self.original_test_home {
            Some(value) => env::set_var("YUANHENG_SWITCH_TEST_HOME", value),
            None => env::remove_var("YUANHENG_SWITCH_TEST_HOME"),
        }
        match &self.original_userprofile {
            Some(value) => env::set_var("USERPROFILE", value),
            None => env::remove_var("USERPROFILE"),
        }
        match &self.original_home {
            Some(value) => env::set_var("HOME", value),
            None => env::remove_var("HOME"),
        }
    }
}

#[test]
fn provider_deeplink_is_rejected() {
    let error =
        parse_deeplink_url("yuanhengswitch://v1/import?resource=provider&app=claude&name=Legacy")
            .unwrap_err();
    assert!(error
        .to_string()
        .contains("Unsupported resource type: provider"));
}

#[test]
fn invalid_scheme_and_version_are_rejected() {
    assert!(parse_deeplink_url("https://v1/import?resource=skill&repo=a/b").is_err());
    assert!(parse_deeplink_url("yuanhengswitch://v2/import?resource=skill&repo=a/b").is_err());
}

#[test]
fn parse_prompt_deeplink_supports_all_prompt_apps() {
    let content = BASE64_STANDARD.encode("Hello World");
    for app in [
        "claude",
        "codex",
        "gemini",
        "grokbuild",
        "opencode",
        "openclaw",
        "hermes",
    ] {
        let url = format!(
            "yuanhengswitch://v1/import?resource=prompt&app={app}&name=test&content={content}&enabled=true"
        );
        let request = parse_deeplink_url(&url).unwrap();
        assert_eq!(request.resource, "prompt");
        assert_eq!(request.app.as_deref(), Some(app));
        assert_eq!(request.content.as_deref(), Some(content.as_str()));
        assert_eq!(request.enabled, Some(true));
    }
}

#[test]
fn parse_mcp_deeplink() {
    let config = BASE64_STANDARD.encode(r#"{"mcpServers":{"test":{"command":"echo"}}}"#);
    let url = format!(
        "yuanhengswitch://v1/import?resource=mcp&apps=claude,codex,grokbuild,opencode,hermes&config={config}&enabled=true"
    );
    let request = parse_deeplink_url(&url).unwrap();
    assert_eq!(request.resource, "mcp");
    assert_eq!(
        request.apps.as_deref(),
        Some("claude,codex,grokbuild,opencode,hermes")
    );
    assert_eq!(request.config.as_deref(), Some(config.as_str()));
}

#[test]
fn parse_skill_deeplink() {
    let request = parse_deeplink_url(
        "yuanhengswitch://v1/import?resource=skill&repo=owner/repo&directory=skills&branch=dev",
    )
    .unwrap();
    assert_eq!(request.resource, "skill");
    assert_eq!(request.repo.as_deref(), Some("owner/repo"));
    assert_eq!(request.directory.as_deref(), Some("skills"));
    assert_eq!(request.branch.as_deref(), Some("dev"));
}

#[test]
fn parse_mcp_apps_covers_supported_clients() {
    let apps = parse_mcp_apps("claude,codex,gemini,grokbuild,opencode,hermes").unwrap();
    assert!(apps.claude);
    assert!(apps.codex);
    assert!(apps.gemini);
    assert!(apps.grokbuild);
    assert!(apps.opencode);
    assert!(apps.hermes);
    assert!(parse_mcp_apps("invalid").is_err());
}

#[test]
#[serial_test::serial]
fn prompt_import_allows_space_in_base64_content() {
    let _test_home = TestHomeGuard::new();
    let request = parse_deeplink_url(
        "yuanhengswitch://v1/import?resource=prompt&app=codex&name=PromptPlus&content=Pj4+",
    )
    .unwrap();
    assert_eq!(request.content.as_deref(), Some("Pj4 "));

    let db = Arc::new(Database::memory().expect("create memory db"));
    let state = AppState::new(db);
    let prompt_id = import_prompt_from_deeplink(&state, request).expect("import prompt");
    let prompts = state.db.get_prompts("codex").expect("get prompts");
    assert_eq!(prompts[&prompt_id].content, ">>>");
}
