import { Suspense, type ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getProfileApplyCalls,
  getProjectLaunchCalls,
  resetProviderState,
  setProfileFixtures,
  setSettings,
} from "../msw/state";
import type { Profile } from "@/lib/api/profiles";
import { emitTauriEvent } from "../msw/tauriMocks";

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

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

describe("App integration with MSW", () => {
  beforeEach(() => {
    resetProviderState();
    localStorage.clear();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("renders the project-first desktop workspace without provider management", async () => {
    const { default: App } = await import("@/App");
    renderApp(App);

    const onboarding = await screen.findByRole("dialog", {
      name: "首次配置",
    });
    expect(onboarding).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "稍后配置" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "首次配置" }),
      ).not.toBeInTheDocument(),
    );

    expect(
      await screen.findByRole("heading", { name: "从一个项目开始" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "项目" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 工具" })).toBeInTheDocument();
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

    const onboarding = await screen.findByRole("dialog", {
      name: "首次配置",
    });
    expect(onboarding).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "稍后配置" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "首次配置" }),
      ).not.toBeInTheDocument(),
    );

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

  it("applies the selected project context before launching another tool", async () => {
    const emptyPerApp = {
      claude: null,
      "claude-desktop": null,
      codex: null,
      gemini: null,
      grokbuild: null,
      opencode: null,
      openclaw: null,
      hermes: null,
    };
    const profile: Profile = {
      id: "project-1",
      name: "元衡桌面端",
      payload: {
        project: {
          directory: "/mock/yuanheng",
          defaultTool: "claude",
        },
        providers: { ...emptyPerApp },
        mcp: { ...emptyPerApp },
        skills: { ...emptyPerApp },
        prompts: { ...emptyPerApp },
      },
    };
    setSettings({ firstRunNoticeConfirmed: true });
    setProfileFixtures([profile], { claude: profile.id });

    const { default: App } = await import("@/App");
    renderApp(App);

    expect(
      await screen.findByRole("heading", { name: "继续 元衡桌面端" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI 工具" }));
    await screen.findByRole("heading", { name: "AI 工具" });

    const codexCard = screen
      .getByRole("heading", { name: "Codex" })
      .closest("article");
    expect(codexCard).not.toBeNull();
    fireEvent.click(codexCard!);

    await waitFor(() =>
      expect(getProfileApplyCalls()).toEqual([
        { id: profile.id, scope: "codex" },
      ]),
    );

    fireEvent.click(
      within(codexCard!).getByRole("button", { name: "在项目中启动" }),
    );
    await waitFor(() =>
      expect(getProjectLaunchCalls()).toEqual([
        { profileId: profile.id, tool: "codex" },
      ]),
    );
    expect(getProfileApplyCalls()).toHaveLength(1);
  });

  it("rejects legacy provider deep links without opening an import dialog", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    const { default: App } = await import("@/App");
    renderApp(App);
    await screen.findByRole("heading", { name: "从一个项目开始" });

    emitTauriEvent("deeplink-import", {
      version: "v1",
      resource: "provider",
      app: "claude",
      name: "Legacy Provider",
    });

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "供应商导入已移除",
        expect.objectContaining({
          description: expect.stringContaining("元衡账号统一管理"),
        }),
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
