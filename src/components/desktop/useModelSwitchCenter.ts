import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { YuanhengReasoningLevel, YuanhengToolId } from "@/lib/api";
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
  TOOL_VERSION_TARGETS,
  isDesktopApp,
  pickPreferredGroup,
  toolLabel,
} from "./ToolSetupGrid";

export const providerIconOf = (app: YuanhengToolId) =>
  app === "codex" || app === "chatgpt-desktop"
    ? "openai"
    : app === "claude-desktop"
      ? "claude"
      : app;

export type ModelSwitchBootstrapPhase = "loading" | "ready" | "empty" | "error";

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
  const inventory = useQuery({
    queryKey: ["desktop", "tool-inventory"],
    queryFn: () =>
      settingsApi.getInstalledToolVersions(Object.values(TOOL_VERSION_TARGETS)),
    retry: false,
    refetchOnWindowFocus: true,
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

  // 后端状态与模型目录变化时同步；正在提交的工具保留乐观选择。
  useEffect(() => {
    if (!connection || !statuses.data) return;
    setModels((current) => {
      const next = { ...current };
      for (const status of statuses.data) {
        if (pendingApps.has(status.app)) continue;
        const model =
          status.model && connection.models.includes(status.model)
            ? status.model
            : status.recommendedModel &&
                connection.models.includes(status.recommendedModel)
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
  }, [connection, pendingApps, statuses.data]);

  const isInstalled = (app: YuanhengToolId) => {
    const versionTarget = TOOL_VERSION_TARGETS[app];
    return Boolean(versionTarget && versionMap.get(versionTarget)?.version);
  };

  const rows = useMemo(
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

  const hasInventory = inventory.data !== undefined;
  const hasStatuses = statuses.data !== undefined;
  const bootstrapPhase: ModelSwitchBootstrapPhase =
    !hasInventory || !hasStatuses
      ? (!hasInventory && inventory.isError) ||
        (!hasStatuses && statuses.isError)
        ? "error"
        : "loading"
      : rows.length > 0
        ? "ready"
        : "empty";

  const retryBootstrap = async () => {
    await Promise.all([inventory.refetch(), statuses.refetch()]);
  };

  const refreshModels = () => {
    if (!connection?.connected || refreshConnection.isPending) return;
    void refreshConnection.mutateAsync().catch(() => {
      toast.error("网站模型同步失败，已保留上次可用列表");
    });
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
      toast.error(`${toolLabel(app)} 没有可用模型`);
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
      if (!result?.configured) throw new Error(result?.error || "配置失败");
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
      if (app === "codex") {
        const bridgeStatus = await codexBridge.refetch();
        if (!isCurrentOperation(app, operationId)) return;
        if (patch.model) {
          toast.success(
            bridgeStatus.data?.connectedTerminals
              ? `已选择 ${model}，终端下一条消息自动应用`
              : `Codex 默认模型已切换到 ${model}`,
          );
        } else {
          toast.success(successMessage(model, group));
        }
      } else {
        toast.success(successMessage(model, group));
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
        toast.error(extractErrorMessage(error) || "模型切换失败");
      }
    } finally {
      finishOperation(app, operationId);
    }
  };

  /** 首页快捷控制：修改后立即写入工具配置。 */
  const applyModel = (app: YuanhengToolId, model: string) =>
    applySelection(app, { model }, () => `${toolLabel(app)} 已切换到 ${model}`);

  const applyGroup = (app: YuanhengToolId, group: string) =>
    applySelection(
      app,
      { group },
      (model) => `${toolLabel(app)} 已切换到 ${group} 分组 · ${model}`,
    );

  const applyReasoning = (app: YuanhengToolId, level: YuanhengReasoningLevel) =>
    applySelection(
      app,
      { reasoning: level },
      (model) => `${toolLabel(app)} 推理等级已更新 · ${model}`,
    );

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
      const dirty = Boolean(
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
        if (!result?.configured) throw new Error(result?.error || "配置失败");
        if (!isCurrentOperation(app, operationId)) return;
        const configuredModel = result.model;
        if (configuredModel) {
          setModels((current) => ({ ...current, [app]: configuredModel }));
        }
      }
      if (!isCurrentOperation(app, operationId)) return;
      await yuanhengApi.launchTool(app, dirty && isDesktopApp(app));
      if (!isCurrentOperation(app, operationId)) return;
      if (app === "codex") await codexBridge.refetch();
      if (!isCurrentOperation(app, operationId)) return;
      toast.success(`${toolLabel(app)} 已启动`);
      await queryClient.invalidateQueries({ queryKey: ["yuanheng"] });
    } catch (error) {
      if (isCurrentOperation(app, operationId)) {
        toast.error(extractErrorMessage(error) || "启动失败");
      }
    } finally {
      finishOperation(app, operationId);
    }
  };

  return {
    connection,
    bootstrapPhase,
    bootstrapRefreshing: inventory.isFetching || statuses.isFetching,
    retryBootstrap,
    rows,
    models,
    groups,
    reasoning,
    pendingApps,
    statusMap,
    codexBridge,
    refreshModels,
    applyModel,
    applyGroup,
    applyReasoning,
    launch,
  };
}

export type ModelSwitchCenterState = ReturnType<typeof useModelSwitchCenter>;
