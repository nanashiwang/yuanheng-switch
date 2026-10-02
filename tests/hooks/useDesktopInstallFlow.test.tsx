import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDesktopInstallFlow } from "@/components/desktop/useDesktopInstallFlow";
const api = vi.hoisted(() => ({
  openExternal: vi.fn(),
  getInstalledToolVersions: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ settingsApi: api }));
const url = "https://claude.ai/download";
describe("desktop download observation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.openExternal.mockResolvedValue(undefined);
    api.getInstalledToolVersions.mockResolvedValue([]);
  });
  afterEach(() => {
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
  it("cleans up when opening the browser fails", async () => {
    api.openExternal.mockRejectedValue(new Error("offline"));
    const { result, unmount } = renderHook(useDesktopInstallFlow);
    await act(async () => {
      await expect(
        result.current.openAndMonitor("claude-desktop", "claude-desktop", url),
      ).rejects.toThrow("offline");
    });
    expect(result.current.monitoringApps.size).toBe(0);
    unmount();
  });
  it("manual re-detection cancels waiting and ignores a late installed result", async () => {
    let resolve!: (v: unknown[]) => void;
    api.getInstalledToolVersions.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { result, unmount } = renderHook(useDesktopInstallFlow);
    let task!: ReturnType<typeof result.current.openAndMonitor>;
    await act(async () => {
      task = result.current.openAndMonitor(
        "claude-desktop",
        "claude-desktop",
        url,
      );
    });
    await act(async () => {
      result.current.stopAll();
      expect(await task).toEqual({ status: "cancelled" });
    });
    await act(async () => {
      resolve([{ version: "1.0" }]);
    });
    expect(result.current.monitoringApps.size).toBe(0);
    unmount();
  });
  it("times out even when opening the browser never settles", async () => {
    api.openExternal.mockImplementation(() => new Promise(() => {}));
    const { result, unmount } = renderHook(useDesktopInstallFlow);
    let task!: ReturnType<typeof result.current.openAndMonitor>;
    await act(async () => {
      task = result.current.openAndMonitor(
        "claude-desktop",
        "claude-desktop",
        url,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300000);
      expect(await task).toEqual({ status: "timeout" });
    });
    expect(result.current.monitoringApps.size).toBe(0);
    unmount();
  });
  it("old cleanup does not erase a restarted monitor, and unmount clears polling", async () => {
    const { result, unmount } = renderHook(useDesktopInstallFlow);
    let first!: ReturnType<typeof result.current.openAndMonitor>;
    let second!: typeof first;
    await act(async () => {
      first = result.current.openAndMonitor(
        "claude-desktop",
        "claude-desktop",
        url,
      );
    });
    await act(async () => {
      second = result.current.openAndMonitor(
        "claude-desktop",
        "claude-desktop",
        url,
      );
      expect(await first).toEqual({ status: "cancelled" });
    });
    expect(result.current.monitoringApps.has("claude-desktop")).toBe(true);
    await act(async () => {
      unmount();
      expect(await second).toEqual({ status: "cancelled" });
    });
  });
  it("clears timers after normal detection", async () => {
    api.getInstalledToolVersions.mockResolvedValue([{ version: "1.0" }]);
    const { result, unmount } = renderHook(useDesktopInstallFlow);
    await act(async () => {
      expect(
        (
          await result.current.openAndMonitor(
            "claude-desktop",
            "claude-desktop",
            url,
          )
        ).status,
      ).toBe("detected");
    });
    expect(result.current.monitoringApps.size).toBe(0);
    unmount();
  });
});
