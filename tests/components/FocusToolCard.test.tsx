import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FocusToolCard } from "@/components/desktop/FocusToolCard";
import type {
  ModelSwitchBootstrapPhase,
  ModelSwitchCenterState,
} from "@/components/desktop/useModelSwitchCenter";

function createSwitcher(
  bootstrapPhase: ModelSwitchBootstrapPhase,
  retryBootstrap = vi.fn().mockResolvedValue(undefined),
): ModelSwitchCenterState {
  return {
    connection: {
      connected: true,
      baseUrl: "https://cn.meta-api.vip",
      userId: "1024",
      account: null,
      models: [],
      groups: [],
      modelGroups: {},
      reasoningLevels: {},
      announcement: null,
      lastSyncedAt: null,
    },
    terminalModels: [],
    bootstrapPhase,
    bootstrapRefreshing: false,
    retryBootstrap,
    rows: [],
    models: {},
    groups: {},
    reasoning: {},
    pendingApps: new Set(),
    restartRequiredApps: new Set(),
    launchDirectories: {},
    launchDirectoryPendingApps: new Set(),
    statusMap: new Map(),
    codexBridge: {} as ModelSwitchCenterState["codexBridge"],
    refreshModels: vi.fn(),
    applyModel: vi.fn(),
    applyGroup: vi.fn(),
    applyReasoning: vi.fn(),
    chooseLaunchDirectory: vi.fn(),
    launch: vi.fn(),
  };
}

describe("FocusToolCard", () => {
  it("加载期间保留焦点卡位置且不显示未安装结论", () => {
    render(
      <FocusToolCard
        switcher={createSwitcher("loading")}
        onOpenTools={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("正在检测本机工具")).toBeInTheDocument();
    expect(
      screen.queryByText("尚未检测到已安装的 AI 工具"),
    ).not.toBeInTheDocument();
  });

  it("检测完成且为空时才显示安装引导", () => {
    render(
      <FocusToolCard
        switcher={createSwitcher("empty")}
        onOpenTools={vi.fn()}
      />,
    );

    expect(screen.getByText("尚未检测到已安装的 AI 工具")).toBeInTheDocument();
  });

  it("检测失败时提供重试而不是显示未安装", () => {
    const retryBootstrap = vi.fn().mockResolvedValue(undefined);
    render(
      <FocusToolCard
        switcher={createSwitcher("error", retryBootstrap)}
        onOpenTools={vi.fn()}
      />,
    );

    expect(screen.getByText("本机工具检测失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新检测" }));
    expect(retryBootstrap).toHaveBeenCalledTimes(1);
  });

  it("为非 Codex CLI 提供独立工作目录入口", () => {
    const switcher = createSwitcher("ready");
    switcher.rows = ["claude"];
    switcher.models = { claude: "claude-sonnet" };
    switcher.launchDirectories = { claude: "/tmp/claude-project" };
    switcher.statusMap = new Map([
      [
        "claude",
        {
          app: "claude",
          supported: true,
          configured: true,
          needsUpdate: false,
          model: "claude-sonnet",
          recommendedModel: "claude-sonnet",
          message: null,
        },
      ],
    ]);

    render(<FocusToolCard switcher={switcher} onOpenTools={vi.fn()} />);

    const directoryButton = screen.getByRole("button", {
      name: "选择 Claude 工作目录",
    });
    expect(directoryButton).toHaveTextContent("claude-project");
    fireEvent.click(directoryButton);
    expect(switcher.chooseLaunchDirectory).toHaveBeenCalledWith("claude");
  });
});
