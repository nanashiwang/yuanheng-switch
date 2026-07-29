import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopSidebar } from "@/components/desktop/DesktopSidebar";
import { YUANHENG_WEBSITE_URL } from "@/config/yuanhengBrand";

const { openExternalMock } = vi.hoisted(() => ({
  openExternalMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  settingsApi: {
    openExternal: openExternalMock,
  },
}));

describe("DesktopSidebar", () => {
  beforeEach(() => {
    openExternalMock.mockReset().mockResolvedValue(undefined);
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
});
