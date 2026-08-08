//! Desktop application discovery shared by installation checks and launching.
//!
//! Desktop apps are not CLI tools: Store/MSIX installs are often absent from
//! `PATH`, and classic installers may use a per-user or custom directory. Keep
//! discovery and launch resolution in one place so the UI never says an app is
//! missing while the launcher can actually find it (or the reverse).

use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum DesktopLaunchTarget {
    Path(PathBuf),
    #[cfg(target_os = "windows")]
    AppUserModelId(String),
}

#[derive(Debug, Clone)]
pub(crate) struct DesktopAppResolution {
    pub install_path: Option<String>,
    pub version: Option<String>,
    pub detection_source: &'static str,
    pub custom_path: Option<String>,
    pub custom_path_valid: bool,
    pub launch_target: Option<DesktopLaunchTarget>,
}

impl DesktopAppResolution {
    fn not_found(custom_path: Option<String>) -> Self {
        Self {
            install_path: None,
            version: None,
            detection_source: "not_found",
            custom_path_valid: custom_path.is_none(),
            custom_path,
            launch_target: None,
        }
    }
}

fn executable_names(tool: &str) -> &'static [&'static str] {
    match tool {
        "chatgpt-desktop" => {
            #[cfg(target_os = "macos")]
            {
                &["ChatGPT.app", "Codex.app"]
            }
            #[cfg(not(target_os = "macos"))]
            {
                &["ChatGPT.exe", "Codex.exe"]
            }
        }
        "workbuddy" => {
            #[cfg(target_os = "macos")]
            {
                &["WorkBuddy.app"]
            }
            #[cfg(not(target_os = "macos"))]
            {
                &["WorkBuddy.exe"]
            }
        }
        "claude-desktop" => {
            #[cfg(target_os = "macos")]
            {
                &["Claude.app"]
            }
            #[cfg(not(target_os = "macos"))]
            {
                &["Claude.exe"]
            }
        }
        _ => &[],
    }
}

fn filename_matches(tool: &str, path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    executable_names(tool)
        .iter()
        .any(|expected| expected.eq_ignore_ascii_case(name))
}

fn resolve_file_candidate(tool: &str, path: &Path) -> Option<PathBuf> {
    if path.is_file() && filename_matches(tool, path) {
        return Some(path.to_path_buf());
    }
    #[cfg(target_os = "macos")]
    if path.is_dir() && filename_matches(tool, path) {
        return Some(path.to_path_buf());
    }
    if !path.is_dir() {
        return None;
    }

    for name in executable_names(tool) {
        for candidate in [path.join(name), path.join("bin").join(name)] {
            #[cfg(target_os = "macos")]
            let exists = candidate.is_dir() || candidate.is_file();
            #[cfg(not(target_os = "macos"))]
            let exists = candidate.is_file();
            if exists {
                return Some(candidate);
            }
        }
    }
    None
}

pub(crate) fn validate_custom_desktop_app_path(
    tool: &str,
    raw_path: &str,
) -> Result<PathBuf, String> {
    if executable_names(tool).is_empty() {
        return Err(format!("不支持为 {tool} 设置桌面应用路径"));
    }
    let trimmed = raw_path.trim();
    if trimmed.is_empty() || trimmed.contains('\n') || trimmed.contains('\r') {
        return Err("应用路径为空或包含非法换行符".to_string());
    }
    let path = PathBuf::from(trimmed);
    let resolved = resolve_file_candidate(tool, &path)
        .ok_or_else(|| format!("所选路径中未找到 {}", executable_names(tool).join(" / ")))?;
    std::fs::canonicalize(&resolved).map_err(|error| format!("解析应用路径失败: {error}"))
}

fn custom_resolution(tool: &str, custom_path: Option<&str>) -> Option<DesktopAppResolution> {
    let raw = custom_path?.trim();
    if raw.is_empty() {
        return None;
    }
    let canonical = validate_custom_desktop_app_path(tool, raw).ok()?;
    let display = canonical.to_string_lossy().to_string();
    Some(DesktopAppResolution {
        install_path: Some(display.clone()),
        version: None,
        detection_source: "custom",
        custom_path: Some(raw.to_string()),
        custom_path_valid: true,
        launch_target: Some(DesktopLaunchTarget::Path(canonical)),
    })
}

#[cfg(target_os = "windows")]
fn push_unique(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !path.as_os_str().is_empty() && !paths.contains(&path) {
        paths.push(path);
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn classic_candidates(tool: &str) -> Vec<(PathBuf, &'static str)> {
    let mut candidates = Vec::new();

    #[cfg(target_os = "macos")]
    {
        for name in executable_names(tool) {
            candidates.push((PathBuf::from("/Applications").join(name), "automatic"));
            candidates.push((
                crate::config::get_home_dir()
                    .join("Applications")
                    .join(name),
                "automatic",
            ));
        }
    }

    #[cfg(target_os = "windows")]
    {
        let mut roots = Vec::new();
        for key in [
            "LOCALAPPDATA",
            "APPDATA",
            "ProgramFiles",
            "ProgramFiles(x86)",
        ] {
            if let Some(value) = std::env::var_os(key) {
                push_unique(&mut roots, PathBuf::from(value));
            }
        }
        for root in roots {
            for name in executable_names(tool) {
                let stem = name.trim_end_matches(".exe");
                for path in [
                    root.join("Programs").join(stem).join(name),
                    root.join(stem).join(name),
                    root.join("OpenAI").join(stem).join(name),
                ] {
                    candidates.push((path, "automatic"));
                }
            }
        }
        candidates.extend(windows_registry_candidates(tool));
    }

    candidates
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn classic_candidates(_tool: &str) -> Vec<(PathBuf, &'static str)> {
    Vec::new()
}

fn automatic_classic_resolution(tool: &str) -> Option<DesktopAppResolution> {
    let mut seen = Vec::new();
    for (candidate, source) in classic_candidates(tool) {
        let Some(resolved) = resolve_file_candidate(tool, &candidate) else {
            continue;
        };
        let canonical = std::fs::canonicalize(&resolved).unwrap_or(resolved);
        if seen.contains(&canonical) {
            continue;
        }
        seen.push(canonical.clone());
        let display = canonical.to_string_lossy().to_string();
        return Some(DesktopAppResolution {
            install_path: Some(display),
            version: None,
            detection_source: source,
            custom_path: None,
            custom_path_valid: true,
            launch_target: Some(DesktopLaunchTarget::Path(canonical)),
        });
    }
    None
}

#[cfg(target_os = "windows")]
fn windows_registry_candidates(tool: &str) -> Vec<(PathBuf, &'static str)> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    fn clean_icon_path(raw: &str) -> PathBuf {
        let value = raw.trim().trim_matches('"');
        let value = value
            .rsplit_once(',')
            .filter(|(_, suffix)| suffix.trim().parse::<i32>().is_ok())
            .map(|(path, _)| path)
            .unwrap_or(value)
            .trim_matches('"');
        PathBuf::from(value)
    }

    fn display_name_matches(tool: &str, name: &str) -> bool {
        let name = name.to_ascii_lowercase();
        match tool {
            "chatgpt-desktop" => name.contains("chatgpt") || name == "codex",
            "workbuddy" => name.contains("workbuddy"),
            _ => false,
        }
    }

    let roots = [
        RegKey::predef(HKEY_CURRENT_USER),
        RegKey::predef(HKEY_LOCAL_MACHINE),
    ];
    let mut results = Vec::new();
    for root in roots {
        for name in executable_names(tool) {
            for key_path in [
                format!(r"Software\Microsoft\Windows\CurrentVersion\App Paths\{name}"),
                format!(r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\{name}"),
            ] {
                if let Ok(key) = root.open_subkey_with_flags(key_path, KEY_READ) {
                    if let Ok(value) = key.get_value::<String, _>("") {
                        results.push((clean_icon_path(&value), "registry"));
                    }
                }
            }
        }

        for uninstall_root in [
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
            r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ] {
            let Ok(key) = root.open_subkey_with_flags(uninstall_root, KEY_READ) else {
                continue;
            };
            for subkey_name in key.enum_keys().flatten() {
                let Ok(subkey) = key.open_subkey_with_flags(&subkey_name, KEY_READ) else {
                    continue;
                };
                let display_name = subkey
                    .get_value::<String, _>("DisplayName")
                    .unwrap_or_default();
                if !display_name_matches(tool, &display_name) {
                    continue;
                }
                if let Ok(icon) = subkey.get_value::<String, _>("DisplayIcon") {
                    results.push((clean_icon_path(&icon), "registry"));
                }
                if let Ok(location) = subkey.get_value::<String, _>("InstallLocation") {
                    results.push((PathBuf::from(location), "registry"));
                }
            }
        }
    }
    results
}

#[cfg(target_os = "windows")]
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoreAppInfo {
    app_user_model_id: Option<String>,
    install_location: Option<String>,
    version: Option<String>,
}

#[cfg(target_os = "windows")]
fn powershell_encoded_command(script: &str) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let mut bytes = Vec::with_capacity(script.len() * 2);
    for unit in script.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    STANDARD.encode(bytes)
}

#[cfg(target_os = "windows")]
fn windows_store_resolution(tool: &str) -> Option<DesktopAppResolution> {
    use std::os::windows::process::CommandExt;

    if tool != "chatgpt-desktop" {
        return None;
    }
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$start = Get-StartApps | Where-Object { $_.Name -match '^(ChatGPT|Codex)$' } | Select-Object -First 1
$pkg = Get-AppxPackage | Where-Object {
  $_.Name -match '(?i)(openai.*chatgpt|chatgpt|openai.*codex)' -or
  $_.PackageFamilyName -match '(?i)(openai.*chatgpt|chatgpt|openai.*codex)'
} | Sort-Object Version -Descending | Select-Object -First 1
$aumid = if ($start) { $start.AppID } else { $null }
if (-not $aumid -and $pkg) {
  $manifest = Get-AppxPackageManifest $pkg
  $appId = $manifest.Package.Applications.Application.Id | Select-Object -First 1
  if ($appId) { $aumid = "$($pkg.PackageFamilyName)!$appId" }
}
if ($aumid -or $pkg) {
  [PSCustomObject]@{
    appUserModelId = $aumid
    installLocation = if ($pkg) { $pkg.InstallLocation } else { $null }
    version = if ($pkg) { $pkg.Version.ToString() } else { $null }
  } | ConvertTo-Json -Compress
}
"#;
    let output = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-EncodedCommand",
            &powershell_encoded_command(script),
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let info: StoreAppInfo = serde_json::from_slice(&output.stdout).ok()?;
    let aumid = info.app_user_model_id?.trim().to_string();
    if aumid.is_empty() {
        return None;
    }
    let install_path = info
        .install_location
        .filter(|path| !path.trim().is_empty())
        .unwrap_or_else(|| format!(r"shell:AppsFolder\{aumid}"));
    Some(DesktopAppResolution {
        install_path: Some(install_path),
        version: info.version,
        detection_source: "microsoft_store",
        custom_path: None,
        custom_path_valid: true,
        launch_target: Some(DesktopLaunchTarget::AppUserModelId(aumid)),
    })
}

#[cfg(not(target_os = "windows"))]
fn windows_store_resolution(_tool: &str) -> Option<DesktopAppResolution> {
    None
}

pub(crate) fn discover_desktop_app(tool: &str, custom_path: Option<&str>) -> DesktopAppResolution {
    let configured_custom = custom_path
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(str::to_string);

    if let Some(mut found) = custom_resolution(tool, custom_path) {
        found.custom_path = configured_custom;
        return found;
    }
    if let Some(mut found) = automatic_classic_resolution(tool) {
        found.custom_path_valid = configured_custom.is_none();
        found.custom_path = configured_custom;
        return found;
    }
    if let Some(mut found) = windows_store_resolution(tool) {
        found.custom_path_valid = configured_custom.is_none();
        found.custom_path = configured_custom;
        return found;
    }
    DesktopAppResolution::not_found(configured_custom)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn custom_directory_resolves_supported_executable() {
        let dir = tempdir().expect("tempdir");
        let executable = dir.path().join(executable_names("chatgpt-desktop")[0]);
        #[cfg(target_os = "macos")]
        std::fs::create_dir_all(&executable).expect("create app bundle");
        #[cfg(not(target_os = "macos"))]
        std::fs::write(&executable, b"test").expect("write executable");

        let resolved = validate_custom_desktop_app_path(
            "chatgpt-desktop",
            dir.path().to_string_lossy().as_ref(),
        )
        .expect("resolve custom app");
        assert_eq!(resolved, std::fs::canonicalize(executable).unwrap());
    }

    #[test]
    fn custom_path_rejects_unrelated_file() {
        let dir = tempdir().expect("tempdir");
        let unrelated = dir.path().join("Other.exe");
        std::fs::write(&unrelated, b"test").expect("write unrelated file");
        assert!(validate_custom_desktop_app_path(
            "chatgpt-desktop",
            unrelated.to_string_lossy().as_ref()
        )
        .is_err());
    }

    #[test]
    fn stale_custom_path_is_reported_without_hiding_auto_state() {
        let resolution = discover_desktop_app("unknown", Some("/missing/app"));
        assert_eq!(resolution.detection_source, "not_found");
        assert!(!resolution.custom_path_valid);
        assert_eq!(resolution.custom_path.as_deref(), Some("/missing/app"));
    }
}
