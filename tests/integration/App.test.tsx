import { Suspense, type ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getConfiguredToolCalls,
  getConfiguredToolGroupCalls,
  getConfiguredToolReasoningCalls,
  getLaunchedToolCalls,
  getLaunchedToolRequests,
  getRestartedToolCalls,
  resetProviderState,
  setSettings,
  setYuanhengConnection,
  setYuanhengToolStatus,
} from "../msw/state";
import { emitTauriEvent } from "../msw/tauriMocks";
import { server } from "../msw/server";
import i18n from "@/i18n";

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("@/components/providers/ProviderList", () => ({
  ProviderList: ({
    providers,
    currentProviderId,
    onSwitch,
    onEdit,
    onConfigureUsage,
    onOpenWebsite,
  }: any) => (
    <div>
      <div data-testid="provider-list">{JSON.stringify(providers)}</div>
      <div data-testid="current-provider">{currentProviderId}</div>
      <button onClick={() => onSwitch(providers[currentProviderId])}>
        switch
      </button>
      <button onClick={() => onEdit(providers[currentProviderId])}>edit</button>
      <button onClick={() => onConfigureUsage(providers[currentProviderId])}>
        usage
      </button>
      <button onClick={() => onOpenWebsite("https://example.com")}>
        open-website
      </button>
    </div>
  ),
}));

vi.mock("@/components/providers/EditProviderDialog", () => ({
  EditProviderDialog: ({ open, provider, onSubmit, onOpenChange }: any) =>
    open ? (
      <div data-testid="edit-provider-dialog">
        <button
          onClick={() =>
            onSubmit({
              provider: {
                ...provider,
                name: `${provider.name}-edited`,
              },
              originalId: provider.id,
            })
          }
        >
          confirm-edit
        </button>
        <button onClick={() => onOpenChange(false)}>close-edit</button>
      </div>
    ) : null,
}));

vi.mock("@/components/UsageScriptModal", () => ({
  default: ({ isOpen, provider, onSave, onClose }: any) =>
    isOpen ? (
      <div data-testid="usage-modal">
        <span data-testid="usage-provider">{provider?.id}</span>
        <button onClick={() => onSave("script-code")}>save-script</button>
        <button onClick={() => onClose()}>close-usage</button>
      </div>
    ) : null,
}));

vi.mock("@/components/ConfirmDialog", () => ({
  ConfirmDialog: ({ isOpen, onConfirm, onCancel }: any) =>
    isOpen ? (
      <div data-testid="confirm-dialog">
        <button onClick={() => onConfirm()}>confirm-delete</button>
        <button onClick={() => onCancel()}>cancel-delete</button>
      </div>
    ) : null,
}));

vi.mock("@/components/AppSwitcher", () => ({
  AppSwitcher: ({ activeApp, onSwitch }: any) => (
    <div data-testid="app-switcher">
      <span>{activeApp}</span>
      <button onClick={() => onSwitch("claude")}>switch-claude</button>
      <button onClick={() => onSwitch("codex")}>switch-codex</button>
      <button onClick={() => onSwitch("openclaw")}>switch-openclaw</button>
    </div>
  ),
}));

vi.mock("@/components/UpdateBadge", () => ({
  UpdateBadge: ({ onClick }: any) => (
    <button onClick={onClick}>update-badge</button>
  ),
}));

vi.mock("@/components/mcp/McpPanel", () => ({
  default: ({ open, onOpenChange }: any) =>
    open ? (
      <div data-testid="mcp-panel">
        <button onClick={() => onOpenChange(false)}>close-mcp</button>
      </div>
    ) : (
      <button onClick={() => onOpenChange(true)}>open-mcp</button>
    ),
}));

const renderApp = (AppComponent: ComponentType) => {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <Suspense fallback={<div data-testid="loading">loading</div>}>
        <AppComponent />
      </Suspense>
    </QueryClientProvider>,
  );
};

const dismissOnboarding = async () => {
  const onboarding = await screen.findByRole(
    "dialog",
    { name: "首次配置" },
    { timeout: 10_000 },
  );
  fireEvent.click(within(onboarding).getByRole("button", { name: "稍后配置" }));
  await waitFor(
    () =>
      expect(
        screen.queryByRole("dialog", { name: "首次配置" }),
      ).not.toBeInTheDocument(),
    { timeout: 10_000 },
  );
};

describe("App integration with MSW", { timeout: 15_000 }, () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    resetProviderState();
    setYuanhengConnection({
      connected: true,
      userId: "1024",
      account: {
        username: "mock-user",
        displayName: "Mock User",
        group: "default",
        remainingUsd: 102560.36,
        usedUsd: 99,
      },
    });
    localStorage.clear();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("renders the access screen in English", async () => {
    setSettings({ firstRunNoticeConfirmed: true, language: "en" });
    setYuanhengConnection({ connected: false });
    await i18n.changeLanguage("en");

    const { default: App } = await import("@/App");
    renderApp(App);

    expect(
      await screen.findByRole("heading", { name: "Sign In to YuanHeng" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("登录你的元衡账号")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Visit YuanHeng Website" }),
    ).toBeInTheDocument();
  });

  it("requires login before showing the workspace", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    setYuanhengConnection({ connected: false });

    const { default: App } = await import("@/App");
    renderApp(App);

    expect(
      await screen.findByRole("heading", { name: "登录你的元衡账号" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "工作台" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "首次配置" }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "new-user" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "password123" },
    });
    const loginButtons = screen.getAllByRole("button", { name: "登录" });
    fireEvent.click(loginButtons[loginButtons.length - 1]);

    expect(
      await screen.findByRole("button", { name: "账号与余额" }),
    ).toHaveTextContent("new-user");
    expect(
      screen.getByRole("button", { name: "账号与余额" }),
    ).toHaveTextContent("$10.00");
    expect(
      await screen.findByRole("heading", { name: "工作台" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "账号与余额" }));
    expect(
      await screen.findByRole("heading", { name: "连接与路由" }),
    ).toBeInTheDocument();
  });

  it("renders the tool-first desktop workspace without projects or provider management", async () => {
    const { default: App } = await import("@/App");
    renderApp(App);

    await dismissOnboarding();

    expect(
      await screen.findByRole("heading", {
        name: "工作台",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "需要完成一项设置" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "工具管理" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "项目" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("provider-list")).not.toBeInTheDocument();
    expect(screen.queryByText("添加供应商")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "能力中心" }));
    expect(
      await screen.findByRole("heading", { name: "能力中心" }),
    ).toBeInTheDocument();

    emitTauriEvent("provider-switched", {
      appType: "codex",
      providerId: "codex-2",
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("shows toast when auto sync fails in background", async () => {
    const { default: App } = await import("@/App");
    renderApp(App);

    await dismissOnboarding();

    expect(() => {
      emitTauriEvent("webdav-sync-status-updated", null);
    }).not.toThrow();
    expect(toastErrorMock).not.toHaveBeenCalled();

    emitTauriEvent("webdav-sync-status-updated", {
      source: "auto",
      status: "error",
      error: "network timeout",
    });

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });

    toastErrorMock.mockReset();
    expect(() => {
      emitTauriEvent("s3-sync-status-updated", null);
    }).not.toThrow();
    expect(toastErrorMock).not.toHaveBeenCalled();

    emitTauriEvent("s3-sync-status-updated", {
      source: "auto",
      status: "error",
      error: "s3 timeout",
    });

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });
  });

  it("configures a selected tool through Yuanheng before launching it", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    setYuanhengConnection({
      connected: true,
      userId: "1024",
      models: ["claude-sonnet-4-6", "gemini-3-pro", "gpt-5.6"],
    });

    const { default: App } = await import("@/App");
    renderApp(App);

    expect(
      await screen.findByRole("heading", {
        name: "工作台",
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "工具管理" }));
    await screen.findByRole("heading", { name: "工具管理" });

    expect(await screen.findByLabelText("Codex 模型选择")).toBeInTheDocument();
    expect(
      await screen.findByLabelText("Claude Desktop 模型选择"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "配置 Codex" }));
    await waitFor(() => expect(getConfiguredToolCalls()).toEqual([["codex"]]));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "启动 Codex" })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: "启动 Codex" }));
    await waitFor(() => expect(getLaunchedToolCalls()).toEqual(["codex"]));
  });

  it("chooses and reuses a Codex working directory when launching", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    localStorage.setItem("yuanheng-switch-last-app", "codex");
    setYuanhengConnection({
      connected: true,
      userId: "1024",
      models: ["gpt-5.6"],
    });
    setYuanhengToolStatus("codex", {
      configured: true,
      model: "gpt-5.6",
      recommendedModel: "gpt-5.6",
    });

    const { default: App } = await import("@/App");
    renderApp(App);

    await screen.findByRole("heading", { name: "工作台" });
    const directoryButton = await screen.findByRole("button", {
      name: "选择 Codex 工作目录",
    });
    expect(directoryButton).toHaveTextContent("用户主目录");

    fireEvent.click(directoryButton);
    await waitFor(() =>
      expect(directoryButton).toHaveTextContent("selected-dir"),
    );

    const focusCard = directoryButton.closest("section");
    expect(focusCard).not.toBeNull();
    fireEvent.click(
      within(focusCard!).getByRole("button", { name: "启动 Codex" }),
    );
    await waitFor(() =>
      expect(getLaunchedToolRequests()).toContainEqual({
        app: "codex",
        cwd: "/mock/selected-dir",
      }),
    );
  });

  it("chooses a separate working directory for another CLI from tool management", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    setYuanhengConnection({
      connected: true,
      userId: "1024",
      models: ["claude-sonnet"],
    });
    setYuanhengToolStatus("claude", {
      configured: true,
      model: "claude-sonnet",
      recommendedModel: "claude-sonnet",
    });

    const { default: App } = await import("@/App");
    renderApp(App);

    await screen.findByRole("heading", { name: "工作台" });
    fireEvent.click(screen.getByRole("button", { name: "工具管理" }));

    const directoryButton = await screen.findByRole("button", {
      name: "选择 Claude 工作目录",
    });
    fireEvent.click(directoryButton);
    await waitFor(() =>
      expect(directoryButton).toHaveTextContent("selected-dir"),
    );

    const toolCard = directoryButton.closest("article");
    expect(toolCard).not.toBeNull();
    fireEvent.click(
      within(toolCard!).getByRole("button", { name: "启动 Claude" }),
    );
    await waitFor(() =>
      expect(getLaunchedToolRequests()).toContainEqual({
        app: "claude",
        cwd: "/mock/selected-dir",
      }),
    );
  });

  it("applies a Codex model selection immediately for the next turn", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    setYuanhengConnection({
      connected: true,
      userId: "1024",
      models: ["gpt-5.6", "k3"],
      reasoningLevels: { k3: ["low", "medium", "high", "xhigh"] },
    });

    const { default: App } = await import("@/App");
    renderApp(App);
    await screen.findByRole("heading", { name: "工作台" });
    fireEvent.click(screen.getByRole("button", { name: "工具管理" }));

    fireEvent.click(await screen.findByLabelText("Codex 模型选择"));
    fireEvent.change(screen.getByPlaceholderText("搜索网站可用模型..."), {
      target: { value: "k3" },
    });
    fireEvent.click(await screen.findByText("k3"));

    await waitFor(() => expect(getConfiguredToolCalls()).toEqual([["codex"]]));
    expect(getConfiguredToolReasoningCalls()).toEqual([{ codex: "auto" }]);
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Codex 已切换到 k3，下一条消息生效",
    );
  });

  it("shows when connected Codex terminals are waiting for the next message", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    setYuanhengConnection({
      connected: true,
      userId: "1024",
      models: ["k3"],
      account: {
        username: "tester",
        displayName: "Tester",
        group: "auto",
        remainingUsd: 12.47,
        usedUsd: 7.53,
      },
    });
    setYuanhengToolStatus("codex", {
      configured: true,
      model: "k3",
    });
    server.use(
      http.post("http://tauri.local/get_codex_session_bridge_status", () =>
        HttpResponse.json({
          running: true,
          endpoint: "ws://127.0.0.1:63536",
          connectedTerminals: 1,
          appliedTerminals: 0,
          pendingTerminals: 1,
          model: "k3",
          reasoningEffort: "high",
        }),
      ),
    );

    const { default: App } = await import("@/App");
    renderApp(App);

    expect(
      await screen.findByText("待 1 个终端下一条消息应用"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("直接调整模型、令牌分组和推理等级"),
    ).toBeInTheDocument();
    // 首页新模块：焦点工具卡、今日速览统计带、账号用量
    expect(screen.getByText("当前工具")).toBeInTheDocument();
    expect(screen.getByText("快捷切换")).toBeInTheDocument();
    expect(screen.getByLabelText(/模型供应商$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/当前工具令牌分组$/)).toBeInTheDocument();
    expect(screen.getByText("今日请求")).toBeInTheDocument();
    expect(screen.getByText("缓存命中率")).toBeInTheDocument();
    expect(screen.getByText("账号用量")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("12.5 万")).toBeInTheDocument();
    expect(screen.getByText("$3.45")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("keeps OpenClaw as the home focus tool", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    localStorage.setItem("yuanheng-switch-last-app", "openclaw");
    setYuanhengConnection({
      connected: true,
      userId: "1024",
      models: ["gpt-5.6"],
    });

    const { default: App } = await import("@/App");
    renderApp(App);

    const currentTool = await screen.findByText("当前工具");
    expect(currentTool.parentElement).toHaveTextContent("OpenClaw");
    expect(currentTool.parentElement).not.toHaveTextContent("Claude");
  });

  it("summarizes HTML announcements instead of rendering CSS source", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    setYuanhengConnection({
      connected: true,
      userId: "1024",
      announcement:
        "<style>*{box-sizing:border-box}.notice{color:red}</style><div><h1>平台公告</h1><p>内部测试与加群福利。</p></div>",
    });

    const { default: App } = await import("@/App");
    renderApp(App);

    expect(
      await screen.findByText("平台公告 · 内部测试与加群福利。"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/box-sizing/)).not.toBeInTheDocument();
  });

  it("updates token group and reasoning directly from the workspace", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    setYuanhengConnection({
      connected: true,
      userId: "1024",
      models: ["gpt-5.6-sol"],
      groups: [
        { id: "svip", description: "SVIP", ratio: 0.5 },
        { id: "vip", description: "VIP", ratio: 0.8 },
      ],
      modelGroups: { "gpt-5.6-sol": ["svip", "vip"] },
      reasoningLevels: {
        "gpt-5.6-sol": ["low", "medium", "high"],
      },
    });
    setYuanhengToolStatus("codex", {
      configured: true,
      model: "gpt-5.6-sol",
      group: "svip",
      reasoning: "medium",
    });

    const { default: App } = await import("@/App");
    renderApp(App);

    expect(
      await screen.findByRole("heading", { name: "快捷控制台" }),
    ).toBeInTheDocument();
    const groupPicker = screen.getByLabelText("Codex 快捷令牌分组");
    const reasoningPicker = screen.getByLabelText("Codex 快捷推理等级");

    fireEvent.change(groupPicker, { target: { value: "vip" } });
    await waitFor(() =>
      expect(getConfiguredToolGroupCalls()).toContainEqual({ codex: "vip" }),
    );

    await waitFor(() => expect(reasoningPicker).toBeEnabled());
    fireEvent.change(reasoningPicker, { target: { value: "high" } });
    await waitFor(() =>
      expect(getConfiguredToolReasoningCalls()).toContainEqual({
        codex: "high",
      }),
    );
  });

  it("filters the current tool models by provider before switching", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    localStorage.setItem("yuanheng-switch-last-app", "codex");
    setYuanhengConnection({
      connected: true,
      userId: "1024",
      models: ["claude-sonnet-5", "gpt-5.6"],
      groups: [
        { id: "svip", description: "SVIP", ratio: 0.5 },
        { id: "vip", description: "VIP", ratio: 0.8 },
      ],
      modelGroups: {
        "claude-sonnet-5": ["svip", "vip"],
        "gpt-5.6": ["svip", "vip"],
      },
    });
    setYuanhengToolStatus("codex", {
      configured: true,
      model: "gpt-5.6",
      group: "svip",
    });

    const { default: App } = await import("@/App");
    renderApp(App);

    const vendorPicker = await screen.findByLabelText("Codex 模型供应商");
    expect(vendorPicker.tagName).toBe("BUTTON");
    expect(vendorPicker).toHaveTextContent("OpenAI · 1");
    fireEvent.click(vendorPicker);
    fireEvent.click(
      await screen.findByRole("option", { name: /Anthropic · 1/ }),
    );

    const modelPicker = await screen.findByLabelText("Codex Anthropic模型");
    fireEvent.click(modelPicker);
    fireEvent.click(
      await screen.findByRole("option", { name: /claude-sonnet-5/ }),
    );

    await waitFor(() =>
      expect(getConfiguredToolCalls()).toContainEqual(["codex"]),
    );
    const groupPicker = await screen.findByLabelText("Codex 当前工具令牌分组");
    expect(groupPicker.tagName).toBe("BUTTON");
    fireEvent.click(groupPicker);
    fireEvent.click(await screen.findByRole("option", { name: /vip · 0.8x/ }));
    await waitFor(() =>
      expect(getConfiguredToolGroupCalls()).toContainEqual({ codex: "vip" }),
    );
  });

  it("offers the Claude Desktop download when the app is not installed", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    let openedUrl = "";
    server.use(
      http.post("http://tauri.local/get_tool_versions", async ({ request }) => {
        const { tools = [] } = (await request.json()) as { tools?: string[] };
        return HttpResponse.json(
          tools
            .filter((name) => name !== "claude-desktop")
            .map((name) => ({
              name,
              version: "1.0.0",
              latest_version: "1.0.0",
              error: null,
              installed_but_broken: false,
              env_type: "macos",
              wsl_distro: null,
            })),
        );
      }),
      http.post("http://tauri.local/open_external", async ({ request }) => {
        const { url } = (await request.json()) as { url: string };
        openedUrl = url;
        return HttpResponse.json(true);
      }),
    );

    const { default: App } = await import("@/App");
    renderApp(App);
    await screen.findByRole("heading", { name: "工作台" });
    fireEvent.click(screen.getByRole("button", { name: "工具管理" }));

    const title = await screen.findByRole("heading", {
      name: "Claude Desktop",
    });
    const card = title.closest("article");
    expect(card).not.toBeNull();
    expect(
      within(card!).queryByLabelText("Claude Desktop 模型选择"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(card!).getByRole("button", {
        name: "打开 Claude Desktop 官方下载页",
      }),
    );
    await waitFor(() => expect(openedUrl).toBe("https://claude.ai/download"));
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "已打开 Claude Desktop 官方下载页，安装完成后请刷新检测",
    );
  });

  it("configures ChatGPT Desktop and WorkBuddy as desktop apps", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    setYuanhengConnection({
      connected: true,
      userId: "1024",
      models: ["gpt-5.6", "k3"],
      reasoningLevels: {
        "gpt-5.6": ["low", "medium", "high", "xhigh"],
        k3: ["minimal", "low", "medium", "high", "xhigh"],
      },
    });

    const { default: App } = await import("@/App");
    renderApp(App);
    await screen.findByRole("heading", {
      name: "工作台",
    });
    fireEvent.click(screen.getByRole("button", { name: "工具管理" }));

    fireEvent.click(await screen.findByLabelText("ChatGPT Desktop 模型选择"));
    fireEvent.change(screen.getByPlaceholderText("搜索网站可用模型..."), {
      target: { value: "k3" },
    });
    fireEvent.click(await screen.findByText("k3"));
    expect(screen.getByLabelText("ChatGPT Desktop 模型选择")).toHaveTextContent(
      "k3",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "配置 ChatGPT Desktop" }),
    );
    await waitFor(() =>
      expect(getConfiguredToolCalls()).toEqual([["chatgpt-desktop"]]),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "启动 ChatGPT Desktop" }),
    );
    await waitFor(() =>
      expect(getRestartedToolCalls()).toEqual(["chatgpt-desktop"]),
    );

    fireEvent.click(screen.getByRole("button", { name: "配置 WorkBuddy" }));
    await waitFor(() =>
      expect(getConfiguredToolCalls()).toEqual([
        ["chatgpt-desktop"],
        ["workbuddy"],
      ]),
    );
  });

  it("searches the live model catalog and launches Claude with the selection", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    setYuanhengConnection({
      connected: true,
      userId: "1024",
      models: ["claude-sonnet-4-6", "deepseek-v3.2", "gpt-5.6"],
    });

    const { default: App } = await import("@/App");
    renderApp(App);

    await screen.findByRole("heading", {
      name: "工作台",
    });
    fireEvent.click(screen.getByRole("button", { name: "工具管理" }));
    await screen.findByRole("heading", { name: "工具管理" });

    fireEvent.click(await screen.findByLabelText("Claude 模型选择"));
    fireEvent.change(screen.getByPlaceholderText("搜索网站可用模型..."), {
      target: { value: "deepseek" },
    });
    fireEvent.click(await screen.findByText("deepseek-v3.2"));
    fireEvent.click(screen.getByRole("button", { name: "启动 Claude" }));

    await waitFor(() => expect(getConfiguredToolCalls()).toEqual([["claude"]]));
    await waitFor(() => expect(getLaunchedToolCalls()).toEqual(["claude"]));
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Claude 已使用 deepseek-v3.2 启动",
    );
  });

  it("maps non-Claude website models into Claude Desktop", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    setYuanhengConnection({
      connected: true,
      userId: "1024",
      models: ["deepseek-v4-pro", "gpt-5.4", "k3"],
      reasoningLevels: {
        "deepseek-v4-pro": [],
        "gpt-5.4": ["low", "medium", "high", "xhigh"],
        k3: ["minimal", "low", "medium", "high", "xhigh"],
      },
    });

    const { default: App } = await import("@/App");
    renderApp(App);

    await screen.findByRole("heading", {
      name: "工作台",
    });
    fireEvent.click(screen.getByRole("button", { name: "工具管理" }));
    fireEvent.click(await screen.findByLabelText("Claude Desktop 模型选择"));
    fireEvent.change(screen.getByPlaceholderText("搜索网站可用模型..."), {
      target: { value: "k3" },
    });
    fireEvent.click(await screen.findByText("k3"));
    expect(screen.getByLabelText("Claude Desktop 推理等级")).toHaveTextContent(
      "极简",
    );
    expect(screen.getByLabelText("Claude Desktop 推理等级")).toHaveTextContent(
      "超高",
    );
    fireEvent.change(screen.getByLabelText("Claude Desktop 推理等级"), {
      target: { value: "high" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "配置 Claude Desktop" }),
    );

    await waitFor(() =>
      expect(getConfiguredToolCalls()).toEqual([["claude-desktop"]]),
    );
    expect(getConfiguredToolReasoningCalls()).toEqual([
      { "claude-desktop": "high" },
    ]);
    expect(getRestartedToolCalls()).toEqual([]);

    fireEvent.click(
      screen.getByRole("button", { name: "启动 Claude Desktop" }),
    );
    await waitFor(() =>
      expect(getRestartedToolCalls()).toEqual(["claude-desktop"]),
    );
  });

  it("selects a token group for models outside the default group", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    setYuanhengConnection({
      connected: true,
      userId: "1024",
      account: {
        username: "nanashi",
        displayName: "Nana",
        group: "default",
        remainingUsd: 100,
        usedUsd: 10,
      },
      models: ["gpt-5.6-sol"],
      groups: [
        { id: "svip", description: "SVIP", ratio: 0.5 },
        { id: "vip", description: "VIP", ratio: 0.5 },
      ],
      modelGroups: { "gpt-5.6-sol": ["svip", "vip"] },
    });

    const { default: App } = await import("@/App");
    renderApp(App);
    await screen.findByRole("heading", {
      name: "工作台",
    });
    fireEvent.click(screen.getByRole("button", { name: "工具管理" }));

    const groupPicker = await screen.findByLabelText("Claude 令牌分组");
    expect(screen.getByLabelText("Claude 模型选择")).toHaveTextContent(
      "gpt-5.6-sol",
    );
    fireEvent.change(groupPicker, { target: { value: "vip" } });
    fireEvent.click(screen.getByRole("button", { name: "配置 Claude" }));

    await waitFor(() =>
      expect(getConfiguredToolGroupCalls()).toContainEqual({ claude: "vip" }),
    );
  });

  it("shows stalled Claude Desktop download details and opens the app", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    setYuanhengConnection({
      connected: true,
      userId: "1024",
      models: ["claude-sonnet-4-6"],
    });
    setYuanhengToolStatus("claude-desktop", {
      runtimeStatus: {
        state: "stalled",
        title: "Claude 组件下载已停滞",
        message:
          "当前已下载 13.1 MB。打开 Claude Desktop 可继续下载；如仍无变化，请检查网络。",
        downloadedBytes: 13_770_104,
        updatedAt: 1_722_000_000,
      },
    });

    const { default: App } = await import("@/App");
    renderApp(App);

    await screen.findByRole("heading", {
      name: "工作台",
    });
    fireEvent.click(screen.getByRole("button", { name: "工具管理" }));
    expect(
      await screen.findByText("Claude 组件下载已停滞"),
    ).toBeInTheDocument();
    expect(screen.getByText(/当前已下载 13.1 MB/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "打开 Claude Desktop" }),
    );
    await waitFor(() =>
      expect(getLaunchedToolCalls()).toContain("claude-desktop"),
    );
  });

  it("rejects legacy provider deep links without opening an import dialog", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    const { default: App } = await import("@/App");
    renderApp(App);
    await screen.findByRole("heading", {
      name: "工作台",
    });

    emitTauriEvent("deeplink-import", {
      version: "v1",
      resource: "provider",
      app: "claude",
      name: "Legacy Provider",
    });

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "deeplink.providerImportRemoved",
        expect.objectContaining({
          description: "deeplink.providerImportRemovedDescription",
        }),
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
