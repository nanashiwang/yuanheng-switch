import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  prepare: vi.fn(),
  openExternal: vi.fn(),
  getInstalledToolVersions: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ settingsApi: api }));
vi.mock("@/lib/claudeWorkspaceSetup", () => ({
  ensureClaudeWorkspaceReady: api.prepare,
}));
import { useDesktopInstallFlow } from "@/components/desktop/useDesktopInstallFlow";
describe("desktop observer and Windows preparation boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    api.openExternal.mockResolvedValue(true);
    api.getInstalledToolVersions.mockResolvedValue([
      { install_path: "synthetic-installed" },
    ]);
  });
  afterEach(() => {
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
  it("does not open download or declare installed when prerequisites require restart", async () => {
    api.prepare.mockRejectedValue(new Error("restart required"));
    const { result, unmount } = renderHook(useDesktopInstallFlow);
    await act(async () => {
      await expect(
        result.current.openAndMonitor(
          "claude-desktop",
          "claude-desktop",
          "https://claude.ai/download",
        ),
      ).rejects.toThrow("restart required");
    });
    expect(api.openExternal).not.toHaveBeenCalled();
    expect(api.getInstalledToolVersions).not.toHaveBeenCalled();
    expect(result.current.monitoringApps.size).toBe(0);
    unmount();
  });
  it("stopping observation during preparation prevents late opening and configuration", async () => {
    let release!: () => void;
    api.prepare.mockImplementation(
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    const { result, unmount } = renderHook(useDesktopInstallFlow);
    let task!: ReturnType<typeof result.current.openAndMonitor>;
    await act(async () => {
      task = result.current.openAndMonitor(
        "claude-desktop",
        "claude-desktop",
        "https://claude.ai/download",
      );
    });
    expect(result.current.monitoringApps.has("claude-desktop")).toBe(true);
    await act(async () => {
      result.current.stopAll();
      expect(await task).toEqual({ status: "cancelled" });
    });
    await act(async () => {
      release();
    });
    expect(api.openExternal).not.toHaveBeenCalled();
    unmount();
  });
  it("downloads only after readiness; other desktop apps skip preparation", async () => {
    api.prepare.mockResolvedValue(undefined);
    const { result, unmount } = renderHook(useDesktopInstallFlow);
    await act(async () => {
      expect(
        (
          await result.current.openAndMonitor(
            "claude-desktop",
            "claude-desktop",
            "https://claude.ai/download",
          )
        ).status,
      ).toBe("detected");
      expect(
        (
          await result.current.openAndMonitor(
            "workbuddy",
            "workbuddy",
            "https://www.codebuddy.cn",
          )
        ).status,
      ).toBe("detected");
    });
    expect(api.prepare).toHaveBeenCalledTimes(1);
    expect(api.openExternal).toHaveBeenCalledTimes(2);
    expect(api.prepare.mock.invocationCallOrder[0]).toBeLessThan(
      api.openExternal.mock.invocationCallOrder[0],
    );
    unmount();
  });
});
