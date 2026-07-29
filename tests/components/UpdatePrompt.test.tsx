import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import type {
  UpdateDownloadProgress,
  UpdatePhase,
} from "@/contexts/UpdateContext";

const { openExternalMock, updateContextMock } = vi.hoisted(() => ({
  openExternalMock: vi.fn(),
  updateContextMock: {
    updateInfo: {
      currentVersion: "0.1.0",
      availableVersion: "0.2.0",
      notes: "Fixes and improvements",
    },
    isPromptOpen: true,
    isPortable: false,
    isUpdating: false,
    phase: "available" as UpdatePhase,
    progress: null as UpdateDownloadProgress | null,
    error: null as string | null,
    startUpdate: vi.fn(),
    remindLater: vi.fn(),
    ignoreUpdate: vi.fn(),
  },
}));

vi.mock("@/contexts/UpdateContext", () => ({
  useUpdate: () => updateContextMock,
}));

vi.mock("@/lib/api", () => ({
  settingsApi: {
    openExternal: openExternalMock,
  },
}));

describe("UpdatePrompt", () => {
  beforeEach(() => {
    updateContextMock.isPromptOpen = true;
    updateContextMock.isPortable = false;
    updateContextMock.isUpdating = false;
    updateContextMock.phase = "available";
    updateContextMock.progress = null;
    updateContextMock.error = null;
    updateContextMock.startUpdate.mockReset().mockResolvedValue(true);
    updateContextMock.remindLater.mockReset();
    updateContextMock.ignoreUpdate.mockReset();
    openExternalMock.mockReset();
  });

  it("展示版本、更新日志和三个更新决策", () => {
    render(<UpdatePrompt />);

    expect(screen.getByText("v0.1.0")).toBeInTheDocument();
    expect(screen.getByText("v0.2.0")).toBeInTheDocument();
    expect(screen.getByText("Fixes and improvements")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "settings.ignoreThisVersion" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "settings.remindLater" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "settings.updateNow" }));

    expect(updateContextMock.ignoreUpdate).toHaveBeenCalledTimes(1);
    expect(updateContextMock.remindLater).toHaveBeenCalledTimes(1);
    expect(updateContextMock.startUpdate).toHaveBeenCalledTimes(1);
  });

  it("下载中展示百分比并锁定决策按钮", () => {
    updateContextMock.isUpdating = true;
    updateContextMock.phase = "downloading";
    updateContextMock.progress = {
      downloaded: 5 * 1024 * 1024,
      total: 10 * 1024 * 1024,
    };

    render(<UpdatePrompt />);

    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("5.0 MB / 10.0 MB")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "settings.updateNow" }),
    ).not.toBeInTheDocument();
  });

  it("安装失败后显示错误和重试入口", () => {
    updateContextMock.phase = "error";
    updateContextMock.error = "signature invalid";

    render(<UpdatePrompt />);

    expect(screen.getByText("signature invalid")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "settings.retryUpdate" }),
    );
    expect(updateContextMock.startUpdate).toHaveBeenCalledTimes(1);
  });

  it("便携版使用打开下载页文案", () => {
    updateContextMock.isPortable = true;
    render(<UpdatePrompt />);

    fireEvent.click(
      screen.getByRole("button", { name: "settings.openDownloadPage" }),
    );
    expect(updateContextMock.startUpdate).toHaveBeenCalledTimes(1);
  });
});
