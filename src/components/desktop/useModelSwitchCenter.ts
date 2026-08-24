import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  isYuanhengCliTool,
  type YuanhengReasoningLevel,
  type YuanhengToolId,
  yuanhengTerminalModels,
} from "@/lib/api";
import { settingsApi, yuanhengApi } from "@/lib/api";
import {
  useConfigureYuanhengTools,
  useCodexSessionBridgeStatus,
  useRefreshYuanheng,
  useYuanhengConnection,
  useYuanhengToolStatuses,
} from "@/lib/query/yuanheng";
import { extractErrorMessage } from "@/utils/errorUtils";
import {
  DESKTOP_TOOLS,
  DESKTOP_DOWNLOAD_URLS,
  TOOL_VERSION_TARGETS,
  isDesktopApp,
  pickPreferredGroup,
  toolLabel,
} from "./ToolSetupGrid";
import {
  clearRestartRequired,
  getRestartRequiredApps,
  markRestartRequired,
  subscribeRestartRequired,
} from "./desktopRestartState";
import { dt } from "./desktopI18n";
import {
  launchDirectoryLabel,
  useToolLaunchDirectories,
} from "./useToolLaunchDirectories";
import { useDesktopInstallFlow } from "./useDesktopInstallFlow";
import {
  clearToolInventoryCache,
  readToolInventoryCache,
  TOOL_INVENTORY_CACHE_TTL_MS,
  writeToolInventoryCache,
} from "./toolInventoryCache";

const TOOL_INVENTORY_TARGETS = Object.values(TOOL_VERSION_TARGETS);

export const providerIconOf = (app: YuanhengToolId) =>
  app === "codex" || app === "chatgpt-desktop"
    ? "openai"
    : app === "claude-desktop"
      ? "claude"
      : app;

export type ModelSwitchBootstrapPhase = "loading" | "ready" | "error";

/**
 * 首页模型切换的共享状态：焦点卡与全部工具列表共用一份选择/提交逻辑，
 * 保证两处切换模型后显示一致。
 */
export function useModelSwitchCenter() {
  const queryClient = useQueryClient();
  const { data: connection } = useYuanhengConnection();
  const refreshConnection = useRefreshYuanheng();
  const statuses = useYuanhengToolStatuses();
  const configure = useConfigureYuanhengTools();
  const codexBridge = useCodexSessionBridgeStatus();
  const desktopInstall = useDesktopInstallFlow();
  const cachedInventory = useMemo(
    () => readToolInventoryCache(TOOL_INVENTORY_TARGETS),
    [],
  );
  const inventory = useQuery({
    queryKey: ["desktop", "tool-inventory"],
    queryFn: async () => {
      const data = await settingsApi.getInstalledToolVersions(
        TOOL_INVENTORY_TARGETS,
      );
      writeToolInventoryCache(TOOL_INVENTORY_TARGETS, data);
      return data;
    },
    initialData: cachedInventory?.data,
    initialDataUpdatedAt: cachedInventory?.savedAt,
    staleTime: TOOL_INVENTORY_CACHE_TTL_MS,
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const [models, setModels] = useState<Partial<Record<YuanhengToolId, string>>>(
    {},
  );
  const [groups, setGroups] = useState<Partial<Record<YuanhengToolId, string>>>(
    {},
  );
  const [reasoning, setReasoning] = useState<
    Partial<Record<YuanhengToolId, YuanhengReasoningLevel>>
  >({});
  const [pendingApps, setPendingApps] = useState<Set<YuanhengToolId>>(
    () => new Set(),
  );
  const [restartRequiredApps, setRestartRequiredApps] = useState(
    getRestartRequiredApps,
  );
  const operationIds = useRef<Partial<Record<YuanhengToolId, number>>>({});
  const operationSequence = useRef(0);

  const versionMap = useMemo(
    () => new Map((inventory.data ?? []).map((item) => [item.name, item])),
    [inventory.data],
  );
  const statusMap = useMemo(
    () => new Map((statuses.data ?? []).map((item) => [item.app, item])),
    [statuses.data],
  );
  const terminalModels = useMemo(
    () => yuanhengTerminalModels(connection),
    [connection],
  );
  const modelMeta = useMemo(
    () =>
      Object.fromEntries(
        terminalModels.map((model) => [
          model,
          {
            groups: connection?.modelGroups[model]?.length ?? 0,
            reasoningLevels: connection?.reasoningLevels[model]?.length ?? 0,
            available: true,
          },
        ]),
      ),
    [connection?.modelGroups, connection?.reasoningLevels, terminalModels],
  );

  useEffect(
    () =>
      subscribeRestartRequired(() =>
        setRestartRequiredApps(getRestartRequiredApps()),
      ),
    [],
  );

  // 后端状态与模型目录变化时同步；正在提交的工具保留乐观选择。
  useEffect(() => {
    if (!connection || !statuses.data) return;
    setModels((current) => {
      const next = { ...current };
      for (const status of statuses.data) {
        if (pendingApps.has(status.app)) continue;
        const model =
          status.model && terminalModels.includes(status.model)
            ? status.model
            : status.recommendedModel &&
                terminalModels.includes(status.recommendedModel)
              ? status.recommendedModel
              : undefined;
        if (model) next[status.app] = model;
        else delete next[status.app];
      }
      return next;
    });
    setGroups((current) => {
      const next = { ...current };
      for (const status of statuses.data) {
        if (pendingApps.has(status.app)) continue;
        if (status.group) next[status.app] = status.group;
        else delete next[status.app];
      }
      return next;
    });
    setReasoning((current) => {
      const next = { ...current };
      for (const status of statuses.data) {
        if (pendingApps.has(status.app)) continue;
        next[status.app] = status.reasoning ?? "auto";
      }
      return next;
    });
  }, [connection, pendingApps, statuses.data, terminalModels]);

  const isInstalled = (app: YuanhengToolId) => {
    const versionTarget = TOOL_VERSION_TARGETS[app];
    return Boolean(versionTarget && versionMap.get(versionTarget)?.version);
  };
  const installedApps = useMemo(
    () => new Set(DESKTOP_TOOLS.filter((app) => isInstalled(app))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [versionMap],
  );

  const runnableRows = useMemo(
    () =>
      DESKTOP_TOOLS.filter(
        (app) => isInstalled(app) && statusMap.get(app)?.supported,
      ).sort((left, right) => {
        const leftConfigured = statusMap.get(left)?.configured ? 0 : 1;
        const rightConfigured = statusMap.get(right)?.configured ? 0 : 1;
        return leftConfigured - rightConfigured;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusMap, versionMap],
  );
  const rows = useMemo(
    () =>
      [...DESKTOP_TOOLS].sort((left, right) => {
        const rank = (app: YuanhengToolId) => {
          if (statusMap.get(app)?.configured && isInstalled(app)) return 0;
          if (isInstalled(app) && statusMap.get(app)?.supported) return 1;
          if (isInstalled(app)) return 2;
          return 3;
        };
        return rank(left) - rank(right);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusMap, versionMap],
  );
  const launchDirectoryState = useToolLaunchDirectories(
    Boolean(connection?.connected),
  );

  const hasInventory = inventory.data !== undefined;
  const hasStatuses = statuses.data !== undefined;
  const bootstrapPhase: ModelSwitchBootstrapPhase =
    inventory.isError || statuses.isError
      ? "error"
      : !hasInventory || !hasStatuses
        ? (!hasInventory && inventory.isError) ||
          (!hasStatuses && statuses.isError)
          ? "error"
          : "loading"
        : "ready";

  const retryBootstrap = async () => {
    clearToolInventoryCache();
    await Promise.all([inventory.refetch(), statuses.refetch()]);
  };

  const refreshModels = () => {
    if (!connection?.connected || refreshConnection.isPending) return;
    void refreshConnection.mutateAsync().catch(() => {
      toast.error(dt("网站模型同步失败，已保留上次可用列表"));
    });
  };

  const install = async (app: YuanhengToolId) => {
    const command = TOOL_VERSION_TARGETS[app];
    const downloadUrl = DESKTOP_DOWNLOAD_URLS[app];
    if (!command && !downloadUrl) return;
    try {
      if (downloadUrl) {
        if (!command) return;
        const monitor = desktopInstall.openAndMonitor(
          app,
          command,
          downloadUrl,
        );
        toast.success(
          dt("已打开 {{v0}} 官方下载页，安装完成后请刷新检测", {
            v0: toolLabel(app),
          }),
        );
        const result = await monitor;
        if (result.status === "cancelled") return;
        if (result.status === "timeout") {
          toast.info(
            dt("暂未检测到 {{v0}}，可重新检测或手动选择路径", {
              v0: toolLabel(app),
            }),
          );
          return;
        }
        await inventory.refetch();
        const freshStatuses = await yuanhengApi.getToolStatuses();
        const status = freshStatuses.find((item) => item.app === app);
        const selectedModel = models[app] ?? status?.recommendedModel;
        if (connection?.connected && status?.supported && selectedModel) {
          const group = pickPreferredGroup(
            connection,
            selectedModel,
            groups[app] ?? status.group ?? undefined,
          );
          const selectedReasoning =
            reasoning[app] ?? status.reasoning ?? "auto";
          const supportedReasoning =
            connection.reasoningLevels[selectedModel] ?? [];
          const normalizedReasoning: YuanhengReasoningLevel =
            selectedReasoning === "auto" ||
            supportedReasoning.includes(selectedReasoning)
              ? selectedReasoning
              : "auto";
          const configured = await configure.mutateAsync({
            apps: [app],
            models: { [app]: selectedModel },
            groups: group ? { [app]: group } : undefined,
            reasoning: { [app]: normalizedReasoning },
          });
          const configuredResult = configured.find((item) => item.app === app);
          if (!configuredResult?.configured) {
            throw new Error(configuredResult?.error || dt("自动配置失败"));
          }
          markRestartRequired(app);
          toast.success(
            dt("已检测到 {{v0}}，并完成元衡配置", { v0: toolLabel(app) }),
          );
        } else {
          toast.success(
            dt("已检测到 {{v0}}，现在可以进行配置", { v0: toolLabel(app) }),
          );
        }
        return;
      }
      if (!command) return;
      await settingsApi.runToolLifecycleAction([command], "install");
      toast.success(dt("{{v0}} 安装任务已完成", { v0: toolLabel(app) }));
      await inventory.refetch();
    } catch (error) {
      toast.error(extractErrorMessage(error) || dt("安装失败"));
    }
  };

  const chooseDesktopPath = async (app: YuanhengToolId) => {
    if (!isDesktopApp(app)) return;
    try {
      const selected = await settingsApi.pickDesktopAppPath(app);
      if (!selected) return;
      desktopInstall.stop(app);
      clearToolInventoryCache();
      await inventory.refetch();
      toast.success(dt("已保存 {{v0}} 应用路径", { v0: toolLabel(app) }));
    } catch (error) {
      toast.error(extractErrorMessage(error) || dt("应用路径无效"));
    }
  };

  const beginOperation = (app: YuanhengToolId) => {
    const operationId = ++operationSequence.current;
    operationIds.current[app] = operationId;
    setPendingApps((current) => {
      if (current.has(app)) return current;
      const next = new Set(current);
      next.add(app);
      return next;
    });
    return operationId;
  };

  const isCurrentOperation = (app: YuanhengToolId, operationId: number) =>
    operationIds.current[app] === operationId;

  const finishOperation = (app: YuanhengToolId, operationId: number) => {
    if (!isCurrentOperation(app, operationId)) return;
    setPendingApps((current) => {
      if (!current.has(app)) return current;
      const next = new Set(current);
      next.delete(app);
      return next;
    });
  };

  const applySelection = async (
    app: YuanhengToolId,
    patch: {
      model?: string;
      group?: string;
      reasoning?: YuanhengReasoningLevel;
    },
    successMessage: (model: string, group?: string) => string,
  ) => {
    const status = statusMap.get(app);
    const previous = {
      model: models[app],
      group: groups[app],
      reasoning: reasoning[app],
    };
    const model =
      patch.model ?? models[app] ?? status?.model ?? status?.recommendedModel;
    if (!model) {
      toast.error(dt("{{v0}} 没有可用模型", { v0: toolLabel(app) }));
      return;
    }
    const availableGroups = connection?.modelGroups[model] ?? [];
    const requestedGroup = patch.group ?? groups[app] ?? status?.group;
    const group =
      requestedGroup && availableGroups.includes(requestedGroup)
        ? requestedGroup
        : pickPreferredGroup(connection, model, requestedGroup ?? undefined);
    const supportedReasoning = connection?.reasoningLevels[model] ?? [];
    const requestedReasoning =
      patch.reasoning ?? reasoning[app] ?? status?.reasoning ?? "auto";
    const selectedReasoning: YuanhengReasoningLevel =
      requestedReasoning === "auto" ||
      supportedReasoning.includes(requestedReasoning)
        ? requestedReasoning
        : "auto";

    setModels((current) => ({ ...current, [app]: model }));
    setGroups((current) => {
      const next = { ...current };
      if (group) next[app] = group;
      else delete next[app];
      return next;
    });
    setReasoning((current) => ({
      ...current,
      [app]: selectedReasoning,
    }));
    const operationId = beginOperation(app);
    try {
      const results = await configure.mutateAsync({
        apps: [app],
        models: { [app]: model },
        groups: group ? { [app]: group } : undefined,
        reasoning: { [app]: selectedReasoning },
      });
      const result = results.find((item) => item.app === app);
      if (!result?.configured) throw new Error(result?.error || dt("配置失败"));
      if (!isCurrentOperation(app, operationId)) return;
      setModels((current) => ({
        ...current,
        [app]: result.model ?? model,
      }));
      setGroups((current) => {
        const next = { ...current };
        if (group) next[app] = group;
        else delete next[app];
        return next;
      });
      setReasoning((current) => ({
        ...current,
        [app]: selectedReasoning,
      }));
      markRestartRequired(app);
      if (app === "codex") {
        const bridgeStatus = await codexBridge.refetch();
        if (!isCurrentOperation(app, operationId)) return;
        if (patch.model) {
          toast.success(
            bridgeStatus.data?.connectedTerminals
              ? dt("已选择 {{v0}}，终端下一条消息自动应用", { v0: model })
              : dt("Codex 默认模型已切换到 {{v0}}", { v0: model }),
          );
        } else {
          toast.success(successMessage(model, group));
        }
      } else {
        toast.success(
          app === "chatgpt-desktop"
            ? dt("配置已保存；重启 Codex App 后加载新的模型与推理档位")
            : successMessage(model, group),
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["yuanheng"] });
    } catch (error) {
      if (isCurrentOperation(app, operationId)) {
        setModels((current) => {
          const next = { ...current };
          if (previous.model) next[app] = previous.model;
          else delete next[app];
          return next;
        });
        setGroups((current) => {
          const next = { ...current };
          if (previous.group) next[app] = previous.group;
          else delete next[app];
          return next;
        });
        setReasoning((current) => {
          const next = { ...current };
          if (previous.reasoning) next[app] = previous.reasoning;
          else delete next[app];
          return next;
        });
        toast.error(extractErrorMessage(error) || dt("模型切换失败"));
      }
    } finally {
      finishOperation(app, operationId);
    }
  };

  /** 首页快捷控制：修改后立即写入工具配置。 */
  const applyModel = (app: YuanhengToolId, model: string) =>
    applySelection(app, { model }, () =>
      dt("{{v0}} 已切换到 {{v1}}", { v0: toolLabel(app), v1: model }),
    );

  const applyGroup = (app: YuanhengToolId, group: string) =>
    applySelection(app, { group }, (model) =>
      dt("{{v0}} 已切换到 {{v1}} 分组 · {{v2}}", {
        v0: toolLabel(app),
        v1: group,
        v2: model,
      }),
    );

  const applyReasoning = (app: YuanhengToolId, level: YuanhengReasoningLevel) =>
    applySelection(app, { reasoning: level }, (model) =>
      dt("{{v0}} 推理等级已更新 · {{v1}}", { v0: toolLabel(app), v1: model }),
    );

  const chooseLaunchDirectory = async (app: YuanhengToolId) => {
    try {
      const saved = await launchDirectoryState.chooseDirectory(app);
      if (!saved) return;
      toast.success(
        dt("已将 {{tool}} 工作目录切换为 {{directory}}", {
          tool: toolLabel(app),
          directory: launchDirectoryLabel(saved),
        }),
      );
    } catch (error) {
      toast.error(extractErrorMessage(error) || dt("选择工作目录失败"));
    }
  };

  const launch = async (app: YuanhengToolId) => {
    const operationId = beginOperation(app);
    try {
      const status = statusMap.get(app);
      const model = models[app] ?? status?.recommendedModel ?? status?.model;
      const group = model
        ? pickPreferredGroup(
            connection,
            model,
            groups[app] ?? status?.group ?? undefined,
          )
        : undefined;
      const supportedReasoning = model
        ? (connection?.reasoningLevels[model] ?? [])
        : [];
      const selectedReasoning = reasoning[app] ?? status?.reasoning ?? "auto";
      const normalizedReasoning: YuanhengReasoningLevel =
        selectedReasoning === "auto" ||
        supportedReasoning.includes(selectedReasoning)
          ? selectedReasoning
          : "auto";
      const restartPending = getRestartRequiredApps().has(app);
      const dirty =
        !restartPending &&
        Boolean(
          !status?.configured ||
            (model && model !== status.model) ||
            (group && group !== status.group) ||
            normalizedReasoning !== (status.reasoning ?? "auto"),
        );
      if (dirty && model) {
        const results = await configure.mutateAsync({
          apps: [app],
          models: { [app]: model },
          groups: group ? { [app]: group } : undefined,
          reasoning: { [app]: normalizedReasoning },
        });
        const result = results.find((item) => item.app === app);
        if (!result?.configured)
          throw new Error(result?.error || dt("配置失败"));
        if (!isCurrentOperation(app, operationId)) return;
        const configuredModel = result.model;
        if (configuredModel) {
          setModels((current) => ({ ...current, [app]: configuredModel }));
        }
      }
      if (!isCurrentOperation(app, operationId)) return;
      const shouldRestart = isDesktopApp(app) && (dirty || restartPending);
      await yuanhengApi.launchTool(
        app,
        shouldRestart,
        isYuanhengCliTool(app)
          ? launchDirectoryState.directories[app]
          : undefined,
      );
      if (shouldRestart) clearRestartRequired(app);
      if (!isCurrentOperation(app, operationId)) return;
      if (app === "codex") await codexBridge.refetch();
      if (!isCurrentOperation(app, operationId)) return;
      toast.success(dt("{{v0}} 已启动", { v0: toolLabel(app) }));
      await queryClient.invalidateQueries({ queryKey: ["yuanheng"] });
    } catch (error) {
      if (isCurrentOperation(app, operationId)) {
        toast.error(extractErrorMessage(error) || dt("启动失败"));
      }
    } finally {
      finishOperation(app, operationId);
    }
  };

  return {
    connection,
    terminalModels,
    modelMeta,
    bootstrapPhase,
    bootstrapRefreshing: inventory.isFetching || statuses.isFetching,
    retryBootstrap,
    rows,
    runnableRows,
    installedApps,
    models,
    groups,
    reasoning,
    pendingApps,
    installingApps: desktopInstall.monitoringApps,
    restartRequiredApps,
    launchDirectories: launchDirectoryState.directories,
    launchDirectoryPendingApps: launchDirectoryState.pendingApps,
    statusMap,
    codexBridge,
    refreshModels,
    install,
    chooseDesktopPath,
    applyModel,
    applyGroup,
    applyReasoning,
    chooseLaunchDirectory,
    launch,
  };
}

export type ModelSwitchCenterState = ReturnType<typeof useModelSwitchCenter>;
