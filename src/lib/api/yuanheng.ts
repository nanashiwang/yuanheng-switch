import { invoke } from "@tauri-apps/api/core";

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

  disconnect(): Promise<boolean> {
    return invoke("disconnect_yuanheng");
  },
};
