# YuanHeng Desktop: capability map

Verified from the local checkout on 2026-09-29. This is a scoped navigation aid, not a complete product audit or a replacement for [existing guidance](../README.md). Recheck implementation when using it; extend entries only as tasks confirm the relevant behavior. Do not treat roadmap ideas as implemented features.

| Capability | Entry / UI | API / orchestration | Implementation / data | Review boundary |
|---|---|---|---|---|
| Project connection and local tool configuration | [src/App.tsx](../src/App.tsx) | [src/lib/api/yuanheng.ts](../src/lib/api/yuanheng.ts) | [src-tauri/src/commands/yuanheng.rs](../src-tauri/src/commands/yuanheng.rs) | Console owns keys, model access and billing; inspect desktop configuration application before adding another configuration flow. |
| MCP, skills and prompts | [src/components/skills](../src/components/skills) | [src/lib/api/skills.ts](../src/lib/api/skills.ts) | [src-tauri/src/services/skill.rs](../src-tauri/src/services/skill.rs) | Compare existing MCP and prompt managers as well; preserve local tool compatibility. |
| Usage and local routing | [src/components/usage](../src/components/usage) | [src/lib/api/usage.ts](../src/lib/api/usage.ts) | [src-tauri/src/services/usage_stats.rs](../src-tauri/src/services/usage_stats.rs) | Local proxy usage is not console billing; inspect provider routing and failover before changing selection. |
| Claude Desktop local gateway diagnostics | [YuanhengHealthCard](../src/components/desktop/YuanhengHealthCard.tsx) | [diagnose_yuanheng](../src-tauri/src/commands/yuanheng.rs), [local probe](../src-tauri/src/commands/claude_desktop_diagnostics.rs) | [bounded Core events](../src-tauri/src/core_diagnostics.rs), [TLS connectors](../src-tauri/src/proxy/hyper_client.rs), [MSIX detection](../src-tauri/src/desktop_app_detection.rs) | Default probes only read the local model directory. A healthy Core, valid credential or enabled virtual machine platform is not proof of inference success. Reports reuse the account-bound preview/export snapshot; no prompts, credentials, raw errors or original request IDs. Windows end-to-end validation is separate. |
| Sessions and snapshots | [src/components/sessions](../src/components/sessions) | [src/lib/api/workspace.ts](../src/lib/api/workspace.ts) | [src-tauri/src/commands/workspace.rs](../src-tauri/src/commands/workspace.rs) | Check session and workspace entry points together; retain import and backup compatibility. |

pnpm remains the application package manager. Existing Tauri/Rust checks and signed release workflows remain unchanged.

Before adding a feature, inspect adjacent flows and the current source of truth; shared filters, data definitions and access rules must not diverge across entry points.

Claude diagnostic persistence uses a bounded background writer, not disk I/O on the request path. Snapshot writer counters describe Core-local logging health, not billing. Claude Store discovery accepts only the verified full package family; unknown legacy identities are not trusted by a name prefix.

## 安装与模型选择连续性（2026-10-01）

| 能力/入口 | 复用链路 | 不变量与边界 |
|---|---|---|
| 工具页、快捷控制台、关于页 CLI 安装 | `settingsApi.runToolLifecycleAction` → `toolLifecycleState` → `commands/misc.rs` | 立即发布执行/验证状态，同工具互斥；安装后本机版本探测确认可运行才成功。第三方安装器不提供统一字节进度，不展示虚假百分比。 |
| 纯净环境安装 | Windows Claude 原生 PowerShell 安装器；POSIX/WSL 原生优先；npm 分支依赖检查 | npm 安装在实际执行环境检查 Node/npm；缺失给出 Node.js LTS 指引，不静默修改全局运行时。WSL 依赖不由 Windows 主机检测代替。 |
| 模型下拉与后台刷新 | `ModelPicker` → `useRefreshYuanheng` → `useYuanhengToolStatuses` | 工具状态缓存按地址/账号/连接状态隔离，不按同步时间重建。刷新保留已知状态与弹层；选择、Esc、外部点击仍正常关闭。 |

验收入口：`tests/components/ModelPicker.refresh.test.tsx`、`tests/hooks/diagnosticAccountScope.test.tsx`、`tests/lib/toolLifecycleState.test.tsx` 与 Rust 生命周期/命令测试。浏览器模拟不替代干净 Windows 真机安装验收。
