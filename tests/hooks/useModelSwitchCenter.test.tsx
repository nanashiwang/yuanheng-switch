import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  YuanhengConnectionStatus,
  YuanhengToolConfigureResult,
  YuanhengToolStatus,
} from "@/lib/api";
import { useModelSwitchCenter } from "@/components/desktop/useModelSwitchCenter";
import { createTestQueryClient } from "../utils/testQueryClient";

const invokeMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const connected = (models: string[]): YuanhengConnectionStatus => ({
  connected: true,
  baseUrl: "https://cn.meta-api.vip",
  userId: "1024",
  account: null,
  models,
  groups: [],
  modelGroups: {},
  reasoningLevels: {},
  announcement: null,
  lastSyncedAt: 1,
});

const toolStatus = (
  app: YuanhengToolStatus["app"],
  model: string,
): YuanhengToolStatus => ({
  app,
  supported: true,
  configured: true,
  needsUpdate: false,
  model,
  reasoning: "auto",
  recommendedModel: model,
  message: null,
});

interface WrapperProps {
  children: ReactNode;
}

function createWrapper() {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: WrapperProps) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

describe("useModelSwitchCenter", () => {
  let connection: YuanhengConnectionStatus;
  let statuses: YuanhengToolStatus[];
  let configureResolvers: Map<
    YuanhengToolStatus["app"],
    (value: YuanhengToolConfigureResult[]) => void
  >;

  beforeEach(() => {
    connection = connected(["model-a", "model-b"]);
    statuses = [
      toolStatus("claude", "model-a"),
      toolStatus("codex", "model-a"),
    ];
    configureResolvers = new Map();
    invokeMock.mockReset();
    invokeMock.mockImplementation(
      (command: string, payload: Record<string, unknown> = {}) => {
        if (command === "get_yuanheng_connection") {
          return Promise.resolve(connection);
        }
        if (command === "get_yuanheng_tool_statuses") {
          return Promise.resolve(statuses);
        }
        if (command === "get_installed_tool_versions") {
          const tools = (payload.tools as string[] | undefined) ?? [];
          return Promise.resolve(
            tools.map((name) => ({
              name,
              version: "1.0.0",
              latest_version: "1.0.0",
              error: null,
              installed_but_broken: false,
              env_type: "macos",
              wsl_distro: null,
            })),
          );
        }
        if (command === "get_codex_session_bridge_status") {
          return Promise.resolve({
            running: false,
            endpoint: null,
            connectedTerminals: 0,
            appliedTerminals: 0,
            pendingTerminals: 0,
            model: null,
            reasoningEffort: null,
          });
        }
        if (command === "configure_yuanheng_tools") {
          const app = (payload.apps as YuanhengToolStatus["app"][])[0];
          const model = (
            payload.models as
              | Partial<Record<YuanhengToolStatus["app"], string>>
              | undefined
          )?.[app];
          return new Promise<YuanhengToolConfigureResult[]>((resolve) => {
            configureResolvers.set(app, (value) => {
              const status = statuses.find((item) => item.app === app);
              if (status && model) {
                status.model = model;
                status.recommendedModel = model;
              }
              resolve(value);
            });
          });
        }
        return Promise.resolve(true);
      },
    );
  });

  it("keeps the dashboard in loading state until local inventory resolves", async () => {
    const defaultImplementation = invokeMock.getMockImplementation();
    let resolveInventory!: (value: unknown[]) => void;
    const inventory = new Promise<unknown[]>((resolve) => {
      resolveInventory = resolve;
    });
    invokeMock.mockImplementation(
      (command: string, payload: Record<string, unknown> = {}) => {
        if (command === "get_installed_tool_versions") return inventory;
        return defaultImplementation?.(command, payload);
      },
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useModelSwitchCenter(), { wrapper });

    await waitFor(() => {
      expect(result.current.bootstrapPhase).toBe("loading");
      expect(result.current.rows).toEqual([]);
    });

    await act(async () => {
      resolveInventory([]);
      await inventory;
    });

    await waitFor(() => {
      expect(result.current.bootstrapPhase).toBe("empty");
    });
  });

  it("reports a detection error instead of an empty inventory", async () => {
    const defaultImplementation = invokeMock.getMockImplementation();
    invokeMock.mockImplementation(
      (command: string, payload: Record<string, unknown> = {}) => {
        if (command === "get_installed_tool_versions") {
          return Promise.reject(new Error("probe failed"));
        }
        return defaultImplementation?.(command, payload);
      },
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useModelSwitchCenter(), { wrapper });

    await waitFor(() => {
      expect(result.current.bootstrapPhase).toBe("error");
      expect(result.current.rows).toEqual([]);
    });
  });

  it("drops a stale model after the catalog refreshes", async () => {
    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useModelSwitchCenter(), { wrapper });

    await waitFor(() => {
      expect(result.current.models.codex).toBe("model-a");
    });

    connection = connected(["model-b"]);
    statuses = [toolStatus("codex", "model-b")];
    act(() => {
      queryClient.setQueryData(["yuanheng", "connection"], connection);
      queryClient.setQueryData(["yuanheng", "tools"], statuses);
    });

    await waitFor(() => {
      expect(result.current.models.codex).toBe("model-b");
    });
  });

  it("tracks concurrent operations independently for each tool", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useModelSwitchCenter(), { wrapper });

    await waitFor(() => {
      expect(result.current.rows).toEqual(
        expect.arrayContaining(["claude", "codex"]),
      );
    });

    let claudeRequest!: Promise<void>;
    let codexRequest!: Promise<void>;
    act(() => {
      claudeRequest = result.current.applyModel("claude", "model-b");
      codexRequest = result.current.applyModel("codex", "model-b");
    });

    await waitFor(() => {
      expect([...result.current.pendingApps]).toEqual(
        expect.arrayContaining(["claude", "codex"]),
      );
    });

    await act(async () => {
      configureResolvers.get("claude")?.([
        {
          app: "claude",
          configured: true,
          model: "model-b",
          warnings: [],
          error: null,
        },
      ]);
      await claudeRequest;
    });

    expect(result.current.pendingApps.has("claude")).toBe(false);
    expect(result.current.pendingApps.has("codex")).toBe(true);

    await act(async () => {
      configureResolvers.get("codex")?.([
        {
          app: "codex",
          configured: true,
          model: "model-b",
          warnings: [],
          error: null,
        },
      ]);
      await codexRequest;
    });

    expect(result.current.pendingApps.size).toBe(0);
  });
});
