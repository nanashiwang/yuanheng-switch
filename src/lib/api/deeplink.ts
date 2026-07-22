import { invoke } from "@tauri-apps/api/core";
import type { AppId } from "./types";

export type ResourceType = "prompt" | "mcp" | "skill";

export interface DeepLinkImportRequest {
  version: string;
  resource: ResourceType;

  // Common fields
  app?: AppId;
  name?: string;
  enabled?: boolean;

  // Prompt fields
  content?: string;
  description?: string;

  // MCP fields
  apps?: string; // "claude,codex,gemini"

  // Skill fields
  repo?: string;
  directory?: string;
  branch?: string;

  // Config file fields
  config?: string;
  configFormat?: string;
}

export interface McpImportResult {
  importedCount: number;
  importedIds: string[];
  failed: Array<{
    id: string;
    error: string;
  }>;
}

export type ImportResult =
  | { type: "prompt"; id: string }
  | {
      type: "mcp";
      importedCount: number;
      importedIds: string[];
      failed: Array<{ id: string; error: string }>;
    }
  | { type: "skill"; key: string };

export const deeplinkApi = {
  /**
   * Parse a deep link URL
   * @param url The yuanhengswitch:// URL to parse
   * @returns Parsed deep link request
   */
  parseDeeplink: async (url: string): Promise<DeepLinkImportRequest> => {
    return invoke("parse_deeplink", { url });
  },

  /**
   * Import a resource from a deep link request (unified handler)
   * @param request The deep link import request
   * @returns Import result based on resource type
   */
  importFromDeeplink: async (
    request: DeepLinkImportRequest,
  ): Promise<ImportResult> => {
    return invoke("import_from_deeplink_unified", { request });
  },
};
