import type { ToolVersionInfo } from "@/lib/api/settings";

const CACHE_KEY = "yuanheng.desktop.tool-inventory.v1";
export const TOOL_INVENTORY_CACHE_TTL_MS = 5 * 60_000;

interface ToolInventoryCacheRecord {
  savedAt: number;
  targets: string[];
  data: ToolVersionInfo[];
}

const normalizeTargets = (targets: string[]) =>
  [...new Set(targets)].sort((left, right) => left.localeCompare(right));

export function readToolInventoryCache(
  targets: string[],
): ToolInventoryCacheRecord | undefined {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as ToolInventoryCacheRecord;
    if (
      !Number.isFinite(parsed.savedAt) ||
      Date.now() - parsed.savedAt > TOOL_INVENTORY_CACHE_TTL_MS ||
      !Array.isArray(parsed.targets) ||
      !Array.isArray(parsed.data)
    ) {
      return undefined;
    }
    const requested = normalizeTargets(targets);
    const cached = normalizeTargets(parsed.targets);
    if (
      requested.length !== cached.length ||
      requested.some((target, index) => target !== cached[index])
    ) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export function writeToolInventoryCache(
  targets: string[],
  data: ToolVersionInfo[],
) {
  try {
    const record: ToolInventoryCacheRecord = {
      savedAt: Date.now(),
      targets: normalizeTargets(targets),
      data,
    };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(record));
  } catch {
    // Cache failures must never block live detection.
  }
}

export function clearToolInventoryCache() {
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // Ignore unavailable storage (private mode / hardened WebView).
  }
}
