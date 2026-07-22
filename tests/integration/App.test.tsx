import { Suspense, type ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getConfiguredToolCalls,
  getLaunchedToolCalls,
  resetProviderState,
  setSettings,
  setYuanhengConnection,
} from "../msw/state";
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

  it("renders the tool-first desktop workspace without projects or provider management", async () => {
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
      await screen.findByRole("heading", {
        name: "让需要的 AI 工具立即可用",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 工具" })).toBeInTheDocument();
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
        name: "让需要的 AI 工具立即可用",
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI 工具" }));
    await screen.findByRole("heading", { name: "AI 工具" });

    fireEvent.click(screen.getByRole("button", { name: "配置 Codex" }));
    await waitFor(() => expect(getConfiguredToolCalls()).toEqual([["codex"]]));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "启动 Codex" })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: "启动 Codex" }));
    await waitFor(() => expect(getLaunchedToolCalls()).toEqual(["codex"]));
  });

  it("rejects legacy provider deep links without opening an import dialog", async () => {
    setSettings({ firstRunNoticeConfirmed: true });
    const { default: App } = await import("@/App");
    renderApp(App);
    await screen.findByRole("heading", {
      name: "让需要的 AI 工具立即可用",
    });

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
