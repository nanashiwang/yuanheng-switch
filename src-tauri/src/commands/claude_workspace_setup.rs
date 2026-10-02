//! Claude Desktop first-use prerequisites. No model calls, downloaded elevated
//! scripts, network-rule changes, forced reboot or cancellation of DISM.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspacePhase {
    NotRequired,
    NeedsPreparation,
    Preparing,
    RestartRequired,
    Ready,
    FirmwareRequired,
    Unknown,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePreparation {
    pub phase: WorkspacePhase,
    pub message: String,
}

fn status(phase: WorkspacePhase) -> WorkspacePreparation {
    let message = match phase {
        WorkspacePhase::NotRequired => "当前平台不需要此项 Windows 组件准备。",
        WorkspacePhase::NeedsPreparation => "首次使用 Claude 工作区需要准备 Windows 虚拟机平台。元衡会申请管理员授权，只启用必要功能，不自动重启。",
        WorkspacePhase::Preparing => "Windows 正在准备虚拟机平台，请等待。不要重复安装或关闭系统安装进程；此阶段不能安全强制取消。",
        WorkspacePhase::RestartRequired => "准备结果需要重启确认。请先保存工作并手动重启电脑；重新打开元衡后继续，元衡不会替你重启。",
        WorkspacePhase::Ready => "Windows 基础环境已就绪，可以继续安装或配置 Claude。Claude 自身运行组件下载和模型连接仍需分别完成。",
        WorkspacePhase::FirmwareRequired => "虚拟机平台已启用，但系统虚拟化尚未运行。若刚启用请先重启；仍未恢复时需检查 BIOS/UEFI 虚拟化或系统策略，重复安装不能解决。",
        WorkspacePhase::Unknown => "未能确认 Windows 组件状态，暂未修改系统。请重新检查；受管电脑可能需要管理员协助。",
        WorkspacePhase::Cancelled => "管理员授权未获准，尚未完成组件准备。可以稍后再试；不会反复弹出授权窗口。",
        WorkspacePhase::Failed => "Windows 组件准备未完成。请重新检查系统状态后再试；没有修改代理、防火墙或模型配置。",
    };
    WorkspacePreparation {
        phase,
        message: message.into(),
    }
}

#[cfg(any(windows, test))]
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Environment {
    feature: Option<u32>,
    hypervisor: Option<bool>,
    boot: Option<String>,
    services: Option<bool>,
}

#[cfg(any(windows, test))]
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PendingBoot {
    boot: String,
    #[serde(default)]
    finished: bool,
}

#[cfg(any(windows, test))]
fn assess(env: &Environment, pending: Option<&PendingBoot>) -> WorkspacePreparation {
    let Some(boot) = env.boot.as_ref().filter(|v| !v.is_empty()) else {
        return status(WorkspacePhase::Unknown);
    };
    if pending.is_some_and(|p| &p.boot == boot) {
        if pending.is_some_and(|p| !p.finished) {
            return WorkspacePreparation {
                phase: WorkspacePhase::Unknown,
                message: "之前的系统准备结果尚未确认。请先确认 Windows 安装窗口已结束，再重启电脑并继续；元衡不会重复提交或强杀系统安装。".into(),
            };
        }
        return status(WorkspacePhase::RestartRequired);
    }
    if env.feature == Some(1) && env.services == Some(false) {
        return status(WorkspacePhase::NeedsPreparation);
    }
    match (env.feature, env.hypervisor) {
        (Some(2 | 3), _) => status(WorkspacePhase::NeedsPreparation),
        (Some(1), Some(true)) if env.services == Some(true) => status(WorkspacePhase::Ready),
        (Some(1), Some(false)) => status(WorkspacePhase::FirmwareRequired),
        _ => status(WorkspacePhase::Unknown),
    }
}

#[cfg(any(windows, test))]
fn completed(exit_code: u32) -> WorkspacePreparation {
    match exit_code {
        // Feature changes can require reboot even if DISM reports 0. Always
        // confirm readiness on a new boot; don't silently proceed on stale CIM.
        0 | 3010 | 1641 => status(WorkspacePhase::RestartRequired),
        1223 => status(WorkspacePhase::Cancelled),
        _ => status(WorkspacePhase::Failed),
    }
}

#[tauri::command]
pub async fn get_claude_workspace_preparation() -> Result<WorkspacePreparation, String> {
    #[cfg(windows)]
    {
        windows::query().await
    }
    #[cfg(not(windows))]
    {
        Ok(status(WorkspacePhase::NotRequired))
    }
}

#[tauri::command]
pub async fn prepare_claude_workspace(confirmed: bool) -> Result<WorkspacePreparation, String> {
    if !confirmed {
        return Err("需要用户主动确认组件准备".into());
    }
    #[cfg(windows)]
    {
        tokio::spawn(windows::prepare())
            .await
            .map_err(|_| "组件准备任务状态未知，请重新检查")?
    }
    #[cfg(not(windows))]
    {
        Ok(status(WorkspacePhase::NotRequired))
    }
}

/// Direct IPC callers cannot bypass the preparation gate. Never elevate here:
/// launch must be preceded by explicit user intent in the shared UI flow.
pub(crate) async fn ensure_workspace_ready() -> Result<(), String> {
    let state = get_claude_workspace_preparation().await?;
    if matches!(
        state.phase,
        WorkspacePhase::Ready | WorkspacePhase::NotRequired
    ) {
        Ok(())
    } else {
        Err(state.message)
    }
}

#[cfg(windows)]
mod windows {
    use super::*;
    use std::{path::PathBuf, sync::OnceLock, time::Duration};
    use tokio::sync::Mutex;
    use windows_sys::Win32::{
        Foundation::{CloseHandle, GetLastError, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT},
        System::{
            Com::{
                CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
            },
            SystemInformation::GetSystemDirectoryW,
            Threading::{GetExitCodeProcess, WaitForSingleObject},
        },
        UI::Shell::{
            ShellExecuteExW, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
        },
    };

    // A handle grants observation, not ownership of Windows servicing. We NEVER
    // terminate DISM or attach it to the CLI install kill-on-close Job.
    struct ServicingProcess(HANDLE);
    unsafe impl Send for ServicingProcess {}
    impl Drop for ServicingProcess {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
    static PROCESS: OnceLock<Mutex<Option<ServicingProcess>>> = OnceLock::new();
    static ACTION: OnceLock<Mutex<()>> = OnceLock::new();

    fn process() -> &'static Mutex<Option<ServicingProcess>> {
        PROCESS.get_or_init(|| Mutex::new(None))
    }
    fn marker_path() -> PathBuf {
        crate::config::get_app_config_dir().join("claude-workspace-pending.json")
    }
    fn load_marker() -> Result<Option<PendingBoot>, String> {
        let path = marker_path();
        match std::fs::metadata(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Ok(m) if m.len() <= 2048 => {
                let data = std::fs::read(path).map_err(|_| "无法读取环境准备状态")?;
                serde_json::from_slice(&data)
                    .map(Some)
                    .map_err(|_| "环境准备状态无法识别，请联系支持；未重复提交系统安装".into())
            }
            _ => Err("无法确认环境准备状态；未重复提交系统安装".into()),
        }
    }
    fn clear_marker() -> Result<(), String> {
        match std::fs::remove_file(marker_path()) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err("无法更新环境准备状态；请重新检查".into()),
        }
    }
    fn system_directory() -> Result<PathBuf, String> {
        let mut buffer = [0u16; 32768];
        let len = unsafe { GetSystemDirectoryW(buffer.as_mut_ptr(), buffer.len() as u32) } as usize;
        if len == 0 || len >= buffer.len() {
            return Err("无法定位 Windows 系统目录".into());
        }
        Ok(PathBuf::from(String::from_utf16_lossy(&buffer[..len])))
    }
    async fn environment() -> Result<Environment, String> {
        // Return only fixed scalar facts; no names, paths, network adapters or
        // machine identifiers. Boot time is used only locally, never exported.
        const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
try {
 $f = Get-CimInstance Win32_OptionalFeature -Filter "Name='VirtualMachinePlatform'"
 $c = Get-CimInstance Win32_ComputerSystem
 $o = Get-CimInstance Win32_OperatingSystem
 $h = @(Get-Service -Name vmcompute,hns -ErrorAction SilentlyContinue)
 @{feature=$f.InstallState; hypervisor=$c.HypervisorPresent; services=($h.Count -eq 2); boot=$o.LastBootUpTime.ToUniversalTime().Ticks.ToString()} | ConvertTo-Json -Compress
} catch { Write-Output '{}' }
"#;
        let mut child = tokio::process::Command::new(
            system_directory()?.join("WindowsPowerShell/v1.0/powershell.exe"),
        );
        child
            .args(["-NoProfile", "-NonInteractive", "-Command", SCRIPT])
            .creation_flags(0x08000000)
            .kill_on_drop(true);
        let output = tokio::time::timeout(Duration::from_secs(8), child.output()).await;
        match output {
            Ok(Ok(out)) if out.status.success() && out.stdout.len() <= 4096 => {
                Ok(serde_json::from_slice(&out.stdout).unwrap_or_default())
            }
            _ => Ok(Environment::default()),
        }
    }
    pub(super) async fn query() -> Result<WorkspacePreparation, String> {
        // A cancelled frontend must not drop the servicing process handle.
        let mut active = process().lock().await;
        if let Some(child) = active.as_ref() {
            let wait = unsafe { WaitForSingleObject(child.0, 0) };
            if wait == WAIT_TIMEOUT {
                return Ok(status(WorkspacePhase::Preparing));
            }
            if wait != WAIT_OBJECT_0 {
                return Ok(status(WorkspacePhase::Unknown));
            }
            let mut code = 0;
            if unsafe { GetExitCodeProcess(child.0, &mut code) } == 0 {
                return Ok(status(WorkspacePhase::Unknown));
            }
            active.take();
            let result = completed(code);
            if matches!(result.phase, WorkspacePhase::RestartRequired) {
                if let Some(mut marker) = load_marker()? {
                    marker.finished = true;
                    let data = serde_json::to_vec(&marker).map_err(|_| "无法保存重启状态")?;
                    crate::config::atomic_write(&marker_path(), &data)
                        .map_err(|_| "无法保存重启状态")?;
                }
            } else {
                clear_marker()?;
            }
            return Ok(result);
        }
        drop(active);
        let env = environment().await?;
        let pending = load_marker()?;
        let result = assess(&env, pending.as_ref());
        if pending
            .as_ref()
            .is_some_and(|p| env.boot.as_ref().is_some_and(|b| b != &p.boot))
        {
            clear_marker()?;
        }
        Ok(result)
    }
    fn elevate() -> Result<ServicingProcess, u32> {
        let initialized = unsafe {
            CoInitializeEx(
                std::ptr::null(),
                (COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) as u32,
            )
        };
        if initialized < 0 {
            return Err(1);
        }
        struct ComGuard;
        impl Drop for ComGuard {
            fn drop(&mut self) {
                unsafe {
                    CoUninitialize();
                }
            }
        }
        let _com = ComGuard;
        let root = system_directory().map_err(|_| 1u32)?;
        let wide = |s: &str| s.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
        let exe = wide(&root.join("dism.exe").to_string_lossy());
        let verb = wide("runas");
        let args =
            wide("/Online /Enable-Feature /FeatureName:VirtualMachinePlatform /All /NoRestart");
        let mut info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
        info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
        info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC;
        info.lpVerb = verb.as_ptr();
        info.lpFile = exe.as_ptr();
        info.lpParameters = args.as_ptr();
        info.nShow = 1; // Windows servicing window stays visible; no hidden admin action.
        if unsafe { ShellExecuteExW(&mut info) } == 0 {
            return Err(unsafe { GetLastError() }.max(1));
        }
        if info.hProcess.is_null() {
            // Shell reported success but did not give an observable handle.
            // Do not clear the pending marker or allow another DISM submission.
            return Err(u32::MAX);
        }
        Ok(ServicingProcess(info.hProcess))
    }
    pub(super) async fn prepare() -> Result<WorkspacePreparation, String> {
        let _lock = ACTION.get_or_init(|| Mutex::new(())).lock().await;
        let existing = query().await?;
        if existing.phase != WorkspacePhase::NeedsPreparation {
            return Ok(existing);
        }
        let env = environment().await?;
        if assess(&env, None).phase != WorkspacePhase::NeedsPreparation {
            return Ok(assess(&env, None));
        }
        let marker = PendingBoot {
            boot: env.boot.ok_or("无法确认启动状态，未准备组件")?,
            finished: false,
        };
        let data = serde_json::to_vec(&marker).map_err(|_| "无法保存准备状态")?;
        crate::config::atomic_write(&marker_path(), &data)
            .map_err(|_| "无法保存恢复状态，未准备组件")?;
        // Keep the whole operation alive even if the invoking UI disappears.
        match tokio::task::spawn_blocking(elevate).await {
            Ok(Ok(child)) => {
                *process().lock().await = Some(child);
                Ok(status(WorkspacePhase::Preparing))
            }
            Ok(Err(u32::MAX)) => Ok(status(WorkspacePhase::Unknown)),
            Ok(Err(code)) => {
                clear_marker()?;
                Ok(completed(code))
            }
            Err(_) => Ok(status(WorkspacePhase::Unknown)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn env(feature: Option<u32>, hypervisor: Option<bool>, boot: &str) -> Environment {
        Environment {
            feature,
            hypervisor,
            boot: Some(boot.into()),
            services: Some(true),
        }
    }
    #[test]
    fn reboot_confirmation_is_not_feature_success_and_unknown_is_not_disabled() {
        assert_eq!(
            assess(&Environment::default(), None).phase,
            WorkspacePhase::Unknown
        );
        assert_eq!(
            assess(&env(Some(2), Some(true), "a"), None).phase,
            WorkspacePhase::NeedsPreparation
        );
        assert_eq!(
            assess(&env(Some(1), Some(true), "a"), None).phase,
            WorkspacePhase::Ready
        );
        assert_eq!(
            assess(&env(Some(1), Some(false), "a"), None).phase,
            WorkspacePhase::FirmwareRequired
        );
        let pending = PendingBoot {
            boot: "a".into(),
            finished: true,
        };
        assert_eq!(
            assess(&env(Some(1), Some(true), "a"), Some(&pending)).phase,
            WorkspacePhase::RestartRequired
        );
        assert_eq!(
            assess(&env(Some(1), Some(true), "b"), Some(&pending)).phase,
            WorkspacePhase::Ready
        );
        assert_eq!(
            assess(&env(Some(2), Some(true), "b"), Some(&pending)).phase,
            WorkspacePhase::NeedsPreparation
        );
        let unfinished = PendingBoot {
            boot: "a".into(),
            finished: false,
        };
        assert_eq!(
            assess(&env(Some(1), Some(true), "a"), Some(&unfinished)).phase,
            WorkspacePhase::Unknown,
            "an interrupted UI must not claim the servicing process has exited"
        );
        let mut missing_services = env(Some(1), Some(true), "b");
        missing_services.services = Some(false);
        assert_eq!(
            assess(&missing_services, None).phase,
            WorkspacePhase::NeedsPreparation
        );
        missing_services.services = None;
        assert_eq!(
            assess(&missing_services, None).phase,
            WorkspacePhase::Unknown
        );
    }
    #[test]
    fn exit_codes_and_restoration_marker_are_closed_schema() {
        assert_eq!(completed(3010).phase, WorkspacePhase::RestartRequired);
        assert_eq!(completed(0).phase, WorkspacePhase::RestartRequired);
        assert_eq!(completed(1223).phase, WorkspacePhase::Cancelled);
        assert_eq!(completed(5).phase, WorkspacePhase::Failed);
        assert!(serde_json::from_str::<PendingBoot>(r#"{"boot":"a","command":"evil"}"#).is_err());
        assert!(!serde_json::to_string(&status(WorkspacePhase::Ready))
            .unwrap()
            .contains("token"));
    }

    #[tokio::test]
    async fn no_implicit_permission_and_other_platforms_are_noop() {
        assert!(prepare_claude_workspace(false).await.is_err());
        #[cfg(not(windows))]
        {
            assert_eq!(
                get_claude_workspace_preparation().await.unwrap().phase,
                WorkspacePhase::NotRequired
            );
            assert_eq!(
                prepare_claude_workspace(true).await.unwrap().phase,
                WorkspacePhase::NotRequired
            );
        }
    }
}
