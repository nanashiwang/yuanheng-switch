import { invoke } from "@tauri-apps/api/core";
import type { AppId } from "./types";

export type YuanhengToolId = AppId | "chatgpt-desktop" | "workbuddy";

export const YUANHENG_CLI_TOOLS = [
  "claude",
  "codex",
  "gemini",
  "grokbuild",
  "opencode",
  "openclaw",
  "hermes",
] as const satisfies readonly YuanhengToolId[];

export type YuanhengCliToolId = (typeof YUANHENG_CLI_TOOLS)[number];

export const isYuanhengCliTool = (
  app: YuanhengToolId,
): app is YuanhengCliToolId => YUANHENG_CLI_TOOLS.some((tool) => tool === app);

export interface YuanhengAccount {
  username: string;
  displayName: string;
  group: string;
  remainingUsd: number;
  usedUsd: number;
}

export interface YuanhengGroupOption {
  id: string;
  description: string;
  ratio: number | null;
}

export type YuanhengAnnouncementType =
  | "default"
  | "ongoing"
  | "success"
  | "warning"
  | "error";

export interface YuanhengAnnouncement {
  id: string;
  content: string;
  extra: string | null;
  publishDate: string;
  type: YuanhengAnnouncementType;
}

export interface YuanhengAnnouncementFeed {
  enabled: boolean;
  announcements: YuanhengAnnouncement[];
  source: "platform" | "legacy";
}

export interface YuanhengConnectionStatus {
  connected: boolean;
  baseUrl: string;
  userId: string | null;
  account: YuanhengAccount | null;
  models: string[];
  terminalModels?: string[];
  imageGenerationModels?: string[];
  groups: YuanhengGroupOption[];
  modelGroups: Record<string, string[]>;
  reasoningLevels: Record<string, YuanhengReasoningLevel[]>;
  reasoningDefaults?: Record<string, YuanhengReasoningLevel>;
  announcement: string | null;
  lastSyncedAt: number | null;
}

export function yuanhengTerminalModels(
  connection?: YuanhengConnectionStatus,
): string[] {
  return connection?.terminalModels ?? connection?.models ?? [];
}

export interface YuanhengAuthResult {
  requiresTwoFactor: boolean;
  connection: YuanhengConnectionStatus | null;
}

export type YuanhengReasoningLevel =
  | "auto"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "ultra";

export interface YuanhengToolStatus {
  app: YuanhengToolId;
  supported: boolean;
  configured: boolean;
  needsUpdate: boolean;
  model: string | null;
  group?: string | null;
  reasoning?: YuanhengReasoningLevel | null;
  recommendedModel: string | null;
  message: string | null;
  runtimeWarning?: string | null;
  runtimeStatus?: YuanhengRuntimeStatus | null;
}

export interface YuanhengRuntimeStatus {
  state: "downloading" | "stalled";
  title: string;
  message: string;
  downloadedBytes: number;
  updatedAt: number;
}

export interface CodexSessionBridgeStatus {
  running: boolean;
  endpoint: string | null;
  connectedTerminals: number;
  appliedTerminals: number;
  pendingTerminals: number;
  model: string | null;
  reasoningEffort: string | null;
}

export interface YuanhengToolConfigureResult {
  app: YuanhengToolId;
  configured: boolean;
  model: string | null;
  warnings: string[];
  error: string | null;
}

export interface YuanhengDisconnectResult {
  disconnected: boolean;
  restoredTools: YuanhengToolId[];
  removedTools: YuanhengToolId[];
  retainedTools: YuanhengToolId[];
  warnings: string[];
}

export type YuanhengDiagnosticStatus = "ok" | "warning" | "error";

export interface YuanhengDiagnosticCheck {
  id: string;
  status: YuanhengDiagnosticStatus;
  title: string;
  message: string;
  action:
    | "login"
    | "repair_credentials"
    | "repair_tools"
    | "configure_tools"
    | null;
}

export interface YuanhengDiagnosticReport {
  status: YuanhengDiagnosticStatus;
  checkedAt: number;
  readyTools: number;
  attentionTools: YuanhengToolId[];
  checks: YuanhengDiagnosticCheck[];
}

export const yuanhengApi = {
  getConnection(): Promise<YuanhengConnectionStatus> {
    return invoke("get_yuanheng_connection");
  },

  getAnnouncement(): Promise<string | null> {
    return invoke("get_yuanheng_announcement");
  },

  getAnnouncements(): Promise<YuanhengAnnouncementFeed> {
    return invoke("get_yuanheng_announcements");
  },

  login(username: string, password: string): Promise<YuanhengAuthResult> {
    return invoke("login_yuanheng", { username, password });
  },

  register(username: string, password: string): Promise<YuanhengAuthResult> {
    return invoke("register_yuanheng", { username, password });
  },

  verifyTwoFactor(code: string): Promise<YuanhengAuthResult> {
    return invoke("verify_yuanheng_two_factor", { code });
  },

  refresh(): Promise<YuanhengConnectionStatus> {
    return invoke("refresh_yuanheng_connection");
  },

  rotateDeviceToken(): Promise<YuanhengConnectionStatus> {
    return invoke("rotate_yuanheng_device_token");
  },

  disconnect(): Promise<YuanhengDisconnectResult> {
    return invoke("disconnect_yuanheng");
  },

  rollbackTools(): Promise<YuanhengDisconnectResult> {
    return invoke("rollback_yuanheng_tools");
  },

  openTopup(): Promise<boolean> {
    return invoke("open_yuanheng_topup");
  },

  getToolStatuses(): Promise<YuanhengToolStatus[]> {
    return invoke("get_yuanheng_tool_statuses");
  },

  getCodexSessionBridgeStatus(): Promise<CodexSessionBridgeStatus> {
    return invoke("get_codex_session_bridge_status");
  },

  getDiagnostics(): Promise<YuanhengDiagnosticReport> {
    return invoke("get_yuanheng_diagnostics");
  },

  exportDiagnostics(filePath: string): Promise<string> {
    return invoke("export_yuanheng_diagnostics", { filePath });
  },

  configureTools(
    apps: YuanhengToolId[],
    models?: Partial<Record<YuanhengToolId, string>>,
    groups?: Partial<Record<YuanhengToolId, string>>,
    reasoning?: Partial<Record<YuanhengToolId, YuanhengReasoningLevel>>,
  ): Promise<YuanhengToolConfigureResult[]> {
    return invoke("configure_yuanheng_tools", {
      apps,
      models,
      groups,
      reasoning,
    });
  },

  getLaunchDirectory(app: YuanhengToolId): Promise<string | null> {
    return invoke("get_tool_launch_cwd", { tool: app });
  },

  setLaunchDirectory(app: YuanhengToolId, cwd: string): Promise<string> {
    return invoke("set_tool_launch_cwd", { tool: app, cwd });
  },

  launchTool(
    app: YuanhengToolId,
    restart = false,
    cwd?: string,
  ): Promise<boolean> {
    return invoke(
      "launch_tool",
      cwd ? { tool: app, restart, cwd } : { tool: app, restart },
    );
  },
};
