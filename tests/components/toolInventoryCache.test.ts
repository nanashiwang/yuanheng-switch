import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearToolInventoryCache,
  readToolInventoryCache,
  TOOL_INVENTORY_CACHE_TTL_MS,
  writeToolInventoryCache,
} from "@/components/desktop/toolInventoryCache";

const inventory = [
  {
    name: "codex",
    version: "1.0.0",
    latest_version: null,
    error: null,
    installed_but_broken: false,
    env_type: "macos" as const,
    wsl_distro: null,
    install_path: "/Applications/Codex.app",
    detection_source: "automatic" as const,
    custom_path: null,
    custom_path_valid: true,
  },
];

describe("toolInventoryCache", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("reuses a fresh cache only for the same target set", () => {
    writeToolInventoryCache(["codex"], inventory);

    expect(readToolInventoryCache(["codex"])?.data).toEqual(inventory);
    expect(readToolInventoryCache(["claude"])).toBeUndefined();
  });

  it("expires stale inventory and supports explicit invalidation", () => {
    const now = Date.now();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    writeToolInventoryCache(["codex"], inventory);
    nowSpy.mockReturnValue(now + TOOL_INVENTORY_CACHE_TTL_MS + 1);

    expect(readToolInventoryCache(["codex"])).toBeUndefined();
    clearToolInventoryCache();
    expect(window.localStorage.length).toBe(0);
  });
});
