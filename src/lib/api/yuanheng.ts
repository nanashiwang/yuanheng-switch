import { invoke } from "@tauri-apps/api/core";
import type { AppId } from "./types";

export interface YuanhengAccount {
  username: string;
  displayName: string;
  group: string;
  remainingUsd: number;
  usedUsd: number;
}

export interface YuanhengConnectionStatus {
  connected: boolean;
  baseUrl: string;
  userId: string | null;
  account: YuanhengAccount | null;
  models: string[];
  announcement: string | null;
  lastSyncedAt: number | null;
}

export interface YuanhengToolStatus {
  app: AppId;
  supported: boolean;
  configured: boolean;
  needsUpdate: boolean;
  model: string | null;
  recommendedModel: string | null;
  message: string | null;
}

export interface YuanhengToolConfigureResult {
  app: AppId;
  configured: boolean;
  model: string | null;
  warnings: string[];
  error: string | null;
}

export interface YuanhengDisconnectResult {
  disconnected: boolean;
  restoredTools: AppId[];
  removedTools: AppId[];
  retainedTools: AppId[];
  warnings: string[];
}

export const yuanhengApi = {
  getConnection(): Promise<YuanhengConnectionStatus> {
    return invoke("get_yuanheng_connection");
  },

  connect(
    accessToken: string,
    userId: string,
  ): Promise<YuanhengConnectionStatus> {
    return invoke("connect_yuanheng", { accessToken, userId });
  },

  refresh(): Promise<YuanhengConnectionStatus> {
    return invoke("refresh_yuanheng_connection");
  },

  disconnect(): Promise<YuanhengDisconnectResult> {
    return invoke("disconnect_yuanheng");
  },

  getToolStatuses(): Promise<YuanhengToolStatus[]> {
    return invoke("get_yuanheng_tool_statuses");
  },

  configureTools(
    apps: AppId[],
    models?: Partial<Record<AppId, string>>,
  ): Promise<YuanhengToolConfigureResult[]> {
    return invoke("configure_yuanheng_tools", { apps, models });
  },

  launchTool(app: AppId): Promise<boolean> {
    return invoke("launch_tool", { tool: app });
  },
};
