import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopSidebar } from "@/components/desktop/DesktopSidebar";
import { YUANHENG_WEBSITE_URL } from "@/config/yuanhengBrand";

const { openExternalMock, openTopupMock } = vi.hoisted(() => ({
  openExternalMock: vi.fn(),
  openTopupMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  settingsApi: {
    openExternal: openExternalMock,
  },
  yuanhengApi: {
    openTopup: openTopupMock,
  },
}));

describe("DesktopSidebar", () => {
  beforeEach(() => {
    openExternalMock.mockReset().mockResolvedValue(undefined);
    openTopupMock.mockReset().mockResolvedValue(true);
  });

  it("在侧边栏底部提供官网入口", async () => {
    render(
      <DesktopSidebar view="home" onNavigate={vi.fn()} proxyRunning={false} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "访问元衡官网" }));

    await waitFor(() => {
      expect(openExternalMock).toHaveBeenCalledWith(YUANHENG_WEBSITE_URL);
    });
  });

  it("已登录时可直接打开充值窗口", async () => {
    render(
      <DesktopSidebar
        view="home"
        onNavigate={vi.fn()}
        proxyRunning={false}
        connection={{
          connected: true,
          baseUrl: "https://cn.meta-api.vip",
          userId: "1024",
          account: {
            username: "tester",
            displayName: "测试用户",
            group: "default",
            remainingUsd: 10,
            usedUsd: 1,
          },
          models: [],
          groups: [],
          modelGroups: {},
          reasoningLevels: {},
          announcement: null,
          lastSyncedAt: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "充值" }));

    await waitFor(() => {
      expect(openTopupMock).toHaveBeenCalledTimes(1);
    });
  });
});
