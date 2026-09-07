import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { settingsApi } from "@/lib/api";
import type { ToolVersionInfo } from "@/lib/api/settings";
import {
  useToolInventory,
  DESKTOP_INVENTORY_TARGETS,
} from "@/lib/query/toolInventory";
import {
  writeToolInventoryCache,
  clearToolInventoryCache,
  TOOL_INVENTORY_CACHE_TTL_MS,
} from "@/components/desktop/toolInventoryCache";
import { createTestQueryClient } from "../utils/testQueryClient";

const rows: ToolVersionInfo[] = [
  {
    name: "codex",
    version: "1.0.0",
    latest_version: null,
    error: null,
    installed_but_broken: false,
    env_type: "macos",
    wsl_distro: null,
    install_path: null,
    detection_source: null,
    custom_path: null,
    custom_path_valid: true,
  },
];

function setup() {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("shared local startup inventory", () => {
  beforeEach(() => {
    clearToolInventoryCache();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it("two page consumers share one pending local probe, without querying remote versions", async () => {
    let finish!: (value: ToolVersionInfo[]) => void;
    const local = vi
      .spyOn(settingsApi, "getInstalledToolVersions")
      .mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
    const remote = vi.spyOn(settingsApi, "getToolVersions");
    const { wrapper, client } = setup();
    const a = renderHook(useToolInventory, { wrapper });
    const b = renderHook(useToolInventory, { wrapper });
    await waitFor(() => expect(local).toHaveBeenCalledTimes(1));
    await act(async () => finish(rows));
    await waitFor(() => expect(a.result.current.data).toEqual(rows));
    expect(b.result.current.data).toEqual(rows);
    expect(remote).not.toHaveBeenCalled();
    a.unmount();
    b.unmount();
    client.clear();
  });

  it("a cold launch shows its stale disk snapshot immediately and keeps it if refresh fails", async () => {
    const now = Date.now();
    const clock = vi
      .spyOn(Date, "now")
      .mockReturnValue(now - TOOL_INVENTORY_CACHE_TTL_MS - 1);
    writeToolInventoryCache(DESKTOP_INVENTORY_TARGETS, rows);
    clock.mockRestore();
    vi.spyOn(settingsApi, "getInstalledToolVersions").mockRejectedValue(
      new Error("offline"),
    );
    const { wrapper, client } = setup();
    const view = renderHook(useToolInventory, { wrapper });
    expect(view.result.current.data).toEqual(rows);
    await waitFor(() => expect(view.result.current.isError).toBe(true));
    expect(view.result.current.data).toEqual(rows);
    view.unmount();
    client.clear();
  });

  it("page remount reuses fresh inventory; manual refresh detects an installation change", async () => {
    const local = vi
      .spyOn(settingsApi, "getInstalledToolVersions")
      .mockResolvedValue(rows);
    const { wrapper, client } = setup();
    const first = renderHook(useToolInventory, { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();
    const second = renderHook(useToolInventory, { wrapper });
    expect(second.result.current.data?.[0].version).toBe("1.0.0");
    expect(local).toHaveBeenCalledTimes(1);
    local.mockResolvedValue([{ ...rows[0], version: "2.0.0" }]);
    await act(async () => {
      await second.result.current.refetch();
    });
    expect(local).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(second.result.current.data?.[0].version).toBe("2.0.0"),
    );
    second.unmount();
    client.clear();
  });

  it("does not persist an old pending result after settings invalidate detection", async () => {
    let finish!: (value: ToolVersionInfo[]) => void;
    const local = vi
      .spyOn(settingsApi, "getInstalledToolVersions")
      .mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
    const { wrapper, client } = setup();
    const view = renderHook(useToolInventory, { wrapper });
    await waitFor(() => expect(local).toHaveBeenCalledTimes(1));
    clearToolInventoryCache();
    await act(async () => finish(rows));
    await waitFor(() => expect(view.result.current.isError).toBe(true));
    expect(
      window.localStorage.getItem("yuanheng.desktop.tool-inventory.v1"),
    ).toBeNull();
    view.unmount();
    client.clear();
  });
});
