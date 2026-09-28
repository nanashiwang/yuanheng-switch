# YuanHeng Desktop: capability map

Verified from the local checkout on 2026-09-29. This is a scoped navigation aid, not a complete product audit or a replacement for [existing guidance](../README.md). Recheck implementation when using it; extend entries only as tasks confirm the relevant behavior. Do not treat roadmap ideas as implemented features.

| Capability | Entry / UI | API / orchestration | Implementation / data | Review boundary |
|---|---|---|---|---|
| Project connection and local tool configuration | [src/App.tsx](../src/App.tsx) | [src/lib/api/yuanheng.ts](../src/lib/api/yuanheng.ts) | [src-tauri/src/commands/yuanheng.rs](../src-tauri/src/commands/yuanheng.rs) | Console owns keys, model access and billing; inspect desktop configuration application before adding another configuration flow. |
| MCP, skills and prompts | [src/components/skills](../src/components/skills) | [src/lib/api/skills.ts](../src/lib/api/skills.ts) | [src-tauri/src/services/skill.rs](../src-tauri/src/services/skill.rs) | Compare existing MCP and prompt managers as well; preserve local tool compatibility. |
| Usage and local routing | [src/components/usage](../src/components/usage) | [src/lib/api/usage.ts](../src/lib/api/usage.ts) | [src-tauri/src/services/usage_stats.rs](../src-tauri/src/services/usage_stats.rs) | Local proxy usage is not console billing; inspect provider routing and failover before changing selection. |
| Sessions and snapshots | [src/components/sessions](../src/components/sessions) | [src/lib/api/workspace.ts](../src/lib/api/workspace.ts) | [src-tauri/src/commands/workspace.rs](../src-tauri/src/commands/workspace.rs) | Check session and workspace entry points together; retain import and backup compatibility. |

pnpm remains the application package manager. Existing Tauri/Rust checks and signed release workflows remain unchanged.

Before adding a feature, inspect adjacent flows and the current source of truth; shared filters, data definitions and access rules must not diverge across entry points.
