import { act, renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { yuanhengApi } from "@/lib/api";
import { useRepairYuanheng } from "@/lib/query/yuanheng";
import { createTestQueryClient } from "../utils/testQueryClient";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe("Yuanheng credential repair", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(yuanhengApi, "refresh").mockResolvedValue({
      connected: true,
      baseUrl: "https://cn.meta-api.vip",
      userId: "test",
      account: null,
      models: [],
      groups: [],
      modelGroups: {},
      reasoningLevels: {},
      announcement: null,
      lastSyncedAt: 1,
    });
    vi.spyOn(yuanhengApi, "getCodexAccountMode").mockResolvedValue({
      mode: "official",
      officialLoginAvailable: true,
      yuanhengAvailable: true,
      restartRequired: false,
      message: null,
    });
    vi.spyOn(yuanhengApi, "getToolStatuses").mockResolvedValue(
      (["codex", "chatgpt-desktop", "claude", "gemini"] as const).map(
        (app) => ({
          app,
          supported: true,
          configured: true,
          needsUpdate: false,
          model: "test-model",
          group: `group-${app}`,
          reasoning: "auto" as const,
          recommendedModel: "test-model",
          message: null,
        }),
      ),
    );
    vi.spyOn(yuanhengApi, "configureTools").mockResolvedValue([
      {
        app: "claude",
        configured: true,
        model: "test-model",
        warnings: [],
        error: null,
      },
      {
        app: "gemini",
        configured: true,
        model: "test-model",
        warnings: [],
        error: null,
      },
    ]);
  });

  it("repairs configured tool keys without switching official Codex back to relay", async () => {
    const rotate = vi.spyOn(yuanhengApi, "rotateDeviceToken");
    const { result } = renderHook(() => useRepairYuanheng(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(["repair_credentials"]);
    });
    expect(yuanhengApi.configureTools).toHaveBeenCalledWith([
      "claude",
      "gemini",
    ]);
    expect(rotate).not.toHaveBeenCalled();
  });

  it("does not report success for a partially failed repair", async () => {
    vi.mocked(yuanhengApi.configureTools).mockResolvedValue([
      {
        app: "claude",
        configured: false,
        model: "test-model",
        warnings: [],
        error: "分组验证失败，原配置保留",
      },
    ]);
    const { result } = renderHook(() => useRepairYuanheng(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync(["repair_tools"]),
      ).rejects.toThrow("分组验证失败");
    });
  });
});
