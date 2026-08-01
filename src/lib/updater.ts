import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";

export type UpdateChannel = "stable" | "beta";

export interface UpdateInfo {
  currentVersion: string;
  availableVersion: string;
  notes?: string;
  pubDate?: string;
}

export interface CheckOptions {
  timeout?: number;
  channel?: UpdateChannel;
}

interface BackendUpdateMetadata {
  currentVersion: string;
  availableVersion: string;
  notes?: string;
  pubDate?: string;
}

export async function getCurrentVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "";
  }
}

export async function checkForUpdate(
  opts: CheckOptions = {},
): Promise<
  { status: "up-to-date" } | { status: "available"; info: UpdateInfo }
> {
  const update = await invoke<BackendUpdateMetadata | null>(
    "check_desktop_update",
    { timeoutMs: opts.timeout ?? 30000 },
  );

  if (!update) {
    return { status: "up-to-date" };
  }

  const info: UpdateInfo = {
    currentVersion: update.currentVersion,
    availableVersion: update.availableVersion,
    notes: update.notes,
    pubDate: update.pubDate,
  };

  return { status: "available", info };
}
