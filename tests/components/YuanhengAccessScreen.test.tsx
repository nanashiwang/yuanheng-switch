import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { YuanhengAccessScreen } from "@/components/desktop/YuanhengAccessScreen";
import { YUANHENG_WEBSITE_URL } from "@/config/yuanhengBrand";

const { openExternalMock } = vi.hoisted(() => ({
  openExternalMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  settingsApi: {
    openExternal: openExternalMock,
  },
}));

vi.mock("@/components/desktop/YuanhengConnectionPanel", () => ({
  YuanhengConnectionPanel: () => <div>登录面板</div>,
}));

describe("YuanhengAccessScreen", () => {
  beforeEach(() => {
    openExternalMock.mockReset().mockResolvedValue(undefined);
  });

  it("未登录时也能访问官网", async () => {
    render(<YuanhengAccessScreen />);

    fireEvent.click(screen.getByRole("button", { name: "访问元衡官网" }));

    await waitFor(() => {
      expect(openExternalMock).toHaveBeenCalledWith(YUANHENG_WEBSITE_URL);
    });
  });
});
