import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  CircleOff,
  Download,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  type AppId,
  type YuanhengConnectionStatus,
  type YuanhengReasoningLevel,
  type YuanhengToolId,
  isYuanhengCliTool,
  settingsApi,
  yuanhengApi,
  yuanhengTerminalModels,
} from "@/lib/api";
import {
  useConfigureYuanhengTools,
  useRefreshYuanheng,
  useYuanhengConnection,
  useYuanhengToolStatuses,
} from "@/lib/query/yuanheng";
import { APP_ICON_MAP } from "@/config/appConfig";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "./ModelPicker";
import { CompactSelectPicker } from "./CompactSelectPicker";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errorUtils";
import { dt } from "./desktopI18n";
import {
  launchDirectoryLabel,
  useToolLaunchDirectories,
} from "./useToolLaunchDirectories";
import {
  clearRestartRequired,
  markRestartRequired,
} from "./desktopRestartState";

export const DESKTOP_TOOLS: YuanhengToolId[] = [
  "claude",
  "claude-desktop",
  "codex",
  "chatgpt-desktop",
  "workbuddy",
  "gemini",
  "grokbuild",
  "opencode",
  "openclaw",
  "hermes",
];

export const TOOL_COMMANDS: Partial<Record<YuanhengToolId, string>> = {
  claude: "claude",
  codex: "codex",
  "chatgpt-desktop": "chatgpt-desktop",
  workbuddy: "workbuddy",
  gemini: "gemini",
  grokbuild: "grok",
  opencode: "opencode",
  openclaw: "openclaw",
  hermes: "hermes",
};

export const TOOL_VERSION_TARGETS: Partial<Record<YuanhengToolId, string>> = {
  ...TOOL_COMMANDS,
  "claude-desktop": "claude-desktop",
};

export const DESKTOP_DOWNLOAD_URLS: Partial<Record<YuanhengToolId, string>> = {
  "claude-desktop": "https://claude.ai/download",
  "chatgpt-desktop": "https://openai.com/chatgpt/desktop/",
  workbuddy: "https://www.codebuddy.cn/work/",
};

export const isCoreApp = (app: YuanhengToolId): app is AppId =>
  app !== "chatgpt-desktop" && app !== "workbuddy";

export const isDesktopApp = (app: YuanhengToolId) =>
  app === "claude-desktop" || app === "chatgpt-desktop" || app === "workbuddy";

export const toolLabel = (app: YuanhengToolId) => {
  if (app === "chatgpt-desktop") return "ChatGPT Desktop";
  if (app === "workbuddy") return "WorkBuddy";
  return APP_ICON_MAP[app].label;
};

export const REASONING_LABELS: Record<YuanhengReasoningLevel, string> = {
  auto: "自动",
  none: "关闭",
  minimal: "极简",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "超高",
  max: "最大",
  ultra: "极限",
};

export const reasoningLabel = (
  level: YuanhengReasoningLevel,
  defaultLevel?: YuanhengReasoningLevel,
) =>
  level === "auto" && defaultLevel
    ? dt("自动（默认：{{v0}}）", { v0: dt(REASONING_LABELS[defaultLevel]) })
    : dt(REASONING_LABELS[level]);

/** 为模型挑选默认令牌分组：优先保留当前选择，其次 auto / 账号分组，最后按费率最低 */
export function pickPreferredGroup(
  connection: YuanhengConnectionStatus | undefined,
  model: string,
  current?: string,
): string | undefined {
  if (!connection) return undefined;
  const available = connection.modelGroups[model] ?? [];
  if (current && available.includes(current)) return current;
  if (available.includes("auto")) return "auto";
  const accountGroup = connection.account?.group;
  if (accountGroup && available.includes(accountGroup)) return accountGroup;
  const ratioOf = (id: string) =>
    connection.groups.find((group) => group.id === id)?.ratio ??
    Number.POSITIVE_INFINITY;
  return [...available].sort(
    (left, right) =>
      ratioOf(left) - ratioOf(right) || left.localeCompare(right),
  )[0];
}

interface ToolSetupGridProps {
  activeApp?: AppId;
  compact?: boolean;
  onSetActiveApp?: (app: AppId) => void;
  onConfigured?: () => void;
}

export function ToolSetupGrid({
  activeApp,
  compact = false,
  onSetActiveApp,
  onConfigured,
}: ToolSetupGridProps) {
  const { data: connection } = useYuanhengConnection();
  const refreshConnection = useRefreshYuanheng();
  const statuses = useYuanhengToolStatuses();
  const configure = useConfigureYuanhengTools();
  const launchDirectoryState = useToolLaunchDirectories();
  const versions = useQuery({
    queryKey: ["desktop", "tool-versions"],
    queryFn: () =>
      settingsApi.getToolVersions(Object.values(TOOL_VERSION_TARGETS)),
  });
  const [selected, setSelected] = useState<YuanhengToolId[]>([]);
  const [models, setModels] = useState<Partial<Record<YuanhengToolId, string>>>(
    {},
  );
  const [groups, setGroups] = useState<Partial<Record<YuanhengToolId, string>>>(
    {},
  );
  const [reasoning, setReasoning] = useState<
    Partial<Record<YuanhengToolId, YuanhengReasoningLevel>>
  >({});
  const selectionInitialized = useRef(false);

  const versionMap = useMemo(
    () => new Map((versions.data ?? []).map((item) => [item.name, item])),
    [versions.data],
  );
  const statusMap = useMemo(
    () => new Map((statuses.data ?? []).map((item) => [item.app, item])),
    [statuses.data],
  );
  const tools = DESKTOP_TOOLS;
  const groupMap = useMemo(
    () => new Map((connection?.groups ?? []).map((group) => [group.id, group])),
    [connection?.groups],
  );

  const preferredGroup = (model: string, current?: string) =>
    pickPreferredGroup(connection, model, current);

  useEffect(() => {
    if (!statuses.data) return;
    setModels((current) => {
      const next = { ...current };
      for (const status of statuses.data) {
        const model =
          status.model && connection?.models.includes(status.model)
            ? status.model
            : status.recommendedModel;
        if (!next[status.app] && model) next[status.app] = model;
      }
      return next;
    });
    setReasoning((current) => {
      const next = { ...current };
      for (const status of statuses.data) {
        if (!next[status.app]) next[status.app] = status.reasoning ?? "auto";
      }
      return next;
    });
  }, [connection?.models, statuses.data]);

  useEffect(() => {
    if (!connection) return;
    setGroups((current) => {
      const next = { ...current };
      for (const [app, model] of Object.entries(models) as [
        YuanhengToolId,
        string,
      ][]) {
        const group = preferredGroup(model, current[app]);
        if (group) next[app] = group;
        else delete next[app];
      }
      return next;
    });
  }, [connection, models]);

  useEffect(() => {
    if (selectionInitialized.current || !versions.data || !statuses.data)
      return;
    const defaults = tools.filter((app) => {
      if (isDesktopApp(app)) return false;
      const versionTarget = TOOL_VERSION_TARGETS[app];
      return Boolean(
        versionTarget &&
          versionMap.get(versionTarget)?.version &&
          statusMap.get(app)?.supported,
      );
    });
    setSelected(defaults);
    selectionInitialized.current = true;
  }, [statusMap, statuses.data, tools, versionMap, versions.data]);

  const isInstalled = (app: YuanhengToolId) => {
    const versionTarget = TOOL_VERSION_TARGETS[app];
    return Boolean(versionTarget && versionMap.get(versionTarget)?.version);
  };

  const compatibleModels = () => yuanhengTerminalModels(connection);

  const selectedReasoningFor = (app: YuanhengToolId, model?: string | null) => {
    const selected = reasoning[app] ?? "auto";
    const supported = model ? (connection?.reasoningLevels[model] ?? []) : [];
    return selected === "auto" || supported.includes(selected)
      ? selected
      : "auto";
  };

  const configureApps = async (apps: YuanhengToolId[]) => {
    try {
      const selectedModels = Object.fromEntries(
        apps
          .map((app) => [app, models[app]])
          .filter((entry): entry is [YuanhengToolId, string] =>
            Boolean(entry[1]),
          ),
      ) as Partial<Record<YuanhengToolId, string>>;
      const results = await configure.mutateAsync({
        apps,
        models:
          Object.keys(selectedModels).length > 0 ? selectedModels : undefined,
        groups: Object.fromEntries(
          apps
            .map((app) => [app, groups[app]])
            .filter((entry): entry is [YuanhengToolId, string] =>
              Boolean(entry[1]),
            ),
        ),
        reasoning: Object.fromEntries(
          apps
            .map((app) => [app, selectedReasoningFor(app, models[app])])
            .filter(
              (entry): entry is [YuanhengToolId, YuanhengReasoningLevel] =>
                Boolean(entry[1]),
            ),
        ),
      });
      const succeeded = results.filter((item) => item.configured);
      const failed = results.filter((item) => !item.configured);
      if (succeeded.length > 0) {
        succeeded.forEach((item) => markRestartRequired(item.app));
        toast.success(
          dt("已完成 {{v0}} 个工具的元衡配置", { v0: succeeded.length }),
        );
        onConfigured?.();
      }
      if (failed.length > 0) {
        toast.error(
          failed
            .map((item) =>
              dt("{{v0}}：{{v1}}", {
                v0: toolLabel(item.app),
                v1: item.error ?? dt("配置失败"),
              }),
            )
            .join("；"),
        );
      }
    } catch (error) {
      toast.error(extractErrorMessage(error) || dt("工具配置失败"));
    }
  };

  const applyCodexModel = async (model: string) => {
    const previousModel = models.codex;
    const previousGroup = groups.codex;
    const group = preferredGroup(model, previousGroup);
    const selectedReasoning = selectedReasoningFor("codex", model);
    setModels((current) => ({ ...current, codex: model }));
    setGroups((current) => {
      const next = { ...current };
      if (group) next.codex = group;
      else delete next.codex;
      return next;
    });
    try {
      const results = await configure.mutateAsync({
        apps: ["codex"],
        models: { codex: model },
        groups: group ? { codex: group } : undefined,
        reasoning: { codex: selectedReasoning },
      });
      const result = results.find((item) => item.app === "codex");
      if (!result?.configured)
        throw new Error(result?.error || dt("模型切换失败"));
      toast.success(dt("Codex 已切换到 {{v0}}，下一条消息生效", { v0: model }));
      onConfigured?.();
    } catch (error) {
      setModels((current) => ({ ...current, codex: previousModel }));
      setGroups((current) => {
        const next = { ...current };
        if (previousGroup) next.codex = previousGroup;
        else delete next.codex;
        return next;
      });
      toast.error(extractErrorMessage(error) || dt("模型切换失败"));
    }
  };

  const installTool = async (app: YuanhengToolId) => {
    const command = TOOL_COMMANDS[app];
    const downloadUrl = DESKTOP_DOWNLOAD_URLS[app];
    if (!command && !downloadUrl) return;
    try {
      if (downloadUrl) {
        await settingsApi.openExternal(downloadUrl);
        toast.success(
          dt("已打开 {{v0}} 官方下载页，安装完成后请刷新检测", {
            v0: toolLabel(app),
          }),
        );
        return;
      }
      if (!command) return;
      await settingsApi.runToolLifecycleAction([command], "install");
      toast.success(dt("{{v0}} 安装任务已完成", { v0: toolLabel(app) }));
      await versions.refetch();
    } catch (error) {
      toast.error(extractErrorMessage(error) || dt("安装失败"));
    }
  };

  const chooseDesktopPath = async (app: YuanhengToolId) => {
    try {
      const selected = await settingsApi.pickDesktopAppPath(app);
      if (!selected) return;
      await versions.refetch();
      toast.success(dt("已保存 {{v0}} 应用路径", { v0: toolLabel(app) }));
    } catch (error) {
      toast.error(extractErrorMessage(error) || dt("应用路径无效"));
    }
  };

  const clearDesktopPath = async (app: YuanhengToolId) => {
    try {
      await settingsApi.clearDesktopAppPath(app);
      await versions.refetch();
      toast.success(dt("已恢复自动检测"));
    } catch (error) {
      toast.error(extractErrorMessage(error) || dt("清除应用路径失败"));
    }
  };

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

  const launchTool = async (app: YuanhengToolId, forceRestart = false) => {
    try {
      const status = statusMap.get(app);
      const selectedModel = models[app] ?? status?.recommendedModel;
      const launchedModel = selectedModel ?? status?.model;
      const selectedGroup = selectedModel
        ? preferredGroup(selectedModel, groups[app])
        : undefined;
      const selectedReasoning = selectedReasoningFor(app, selectedModel);
      const needsApply = Boolean(
        !status?.configured ||
          selectedModel !== status.model ||
          (selectedGroup && selectedGroup !== status.group) ||
          ((app === "claude-desktop" ||
            app === "codex" ||
            app === "chatgpt-desktop") &&
            selectedReasoning !== (status.reasoning ?? "auto")),
      );
      if (needsApply) {
        const results = await configure.mutateAsync({
          apps: [app],
          models: selectedModel ? { [app]: selectedModel } : undefined,
          groups: selectedGroup ? { [app]: selectedGroup } : undefined,
          reasoning: { [app]: selectedReasoning },
        });
        const result = results.find((item) => item.app === app);
        if (!result?.configured) {
          throw new Error(result?.error || dt("模型配置失败"));
        }
        onConfigured?.();
      }
      const restarted = isDesktopApp(app) && (needsApply || forceRestart);
      await yuanhengApi.launchTool(
        app,
        restarted,
        isYuanhengCliTool(app)
          ? launchDirectoryState.directories[app]
          : undefined,
      );
      if (restarted) clearRestartRequired(app);
      toast.success(
        dt("{{v0}} 已使用 {{v1}} {{v2}}", {
          v0: toolLabel(app),
          v1: launchedModel ?? dt("推荐模型"),
          v2: restarted
            ? dt("重新打开")
            : isDesktopApp(app)
              ? dt("打开")
              : dt("启动"),
        }),
      );
    } catch (error) {
      toast.error(extractErrorMessage(error) || dt("启动失败"));
    }
  };

  const toggleSelected = (app: YuanhengToolId) => {
    setSelected((current) =>
      current.includes(app)
        ? current.filter((item) => item !== app)
        : [...current, app],
    );
  };

  const refresh = async () => {
    if (connection?.connected) {
      try {
        await refreshConnection.mutateAsync();
      } catch (error) {
        toast.error(extractErrorMessage(error) || dt("网站模型同步失败"));
      }
    }
    await Promise.all([versions.refetch(), statuses.refetch()]);
  };

  const refreshModels = () => {
    if (!connection?.connected || refreshConnection.isPending) return;
    void refreshConnection.mutateAsync().catch(() => {
      toast.error(dt("网站模型同步失败，已保留上次可用列表"));
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold">
            {selected.length > 0
              ? dt("已选择 {{v0}} 个工具", { v0: selected.length })
              : dt("选择你需要使用的工具")}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {dt(
              "元衡将写入 API、模型和认证配置；工作目录仅在你主动选择时更改。",
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={
            versions.isFetching ||
            statuses.isFetching ||
            refreshConnection.isPending
          }
          aria-label={dt("刷新工具状态")}
        >
          <RefreshCw
            className={cn(
              "h-3.5 w-3.5",
              (versions.isFetching ||
                statuses.isFetching ||
                refreshConnection.isPending) &&
                "animate-spin",
            )}
          />
          {dt("刷新")}
        </Button>
        <Button
          size="sm"
          disabled={
            !connection?.connected ||
            selected.length === 0 ||
            configure.isPending
          }
          onClick={() => void configureApps(selected)}
        >
          {configure.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Settings2 className="h-3.5 w-3.5" />
          )}
          {dt("一键配置所选工具")}
        </Button>
      </div>

      {!connection?.connected && (
        <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/[0.055] px-4 py-3 text-[11px] text-amber-800 dark:text-amber-200">
          {dt("请先连接元衡账号，再为工具写入配置。")}
        </div>
      )}

      {connection?.connected &&
        (connection.imageGenerationModels?.length ?? 0) > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/[0.055] px-4 py-3 text-[11px] text-sky-900 dark:text-sky-100">
            <ImageIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {dt(
                "已识别 {{v0}} 个图像生成专用模型。它们不能作为终端主模型，请通过 Images API 或图像生成工具调用。",
                {
                  v0: connection.imageGenerationModels?.length ?? 0,
                },
              )}
            </span>
          </div>
        )}

      <div
        className={cn(
          "grid gap-3",
          compact ? "sm:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3",
        )}
      >
        {tools.map((app, index) => {
          const command = TOOL_COMMANDS[app];
          const versionTarget = TOOL_VERSION_TARGETS[app];
          const version = versionTarget
            ? versionMap.get(versionTarget)
            : undefined;
          const canInstall = Boolean(command || DESKTOP_DOWNLOAD_URLS[app]);
          const installed = isInstalled(app);
          const status = statusMap.get(app);
          const configured = Boolean(status?.configured);
          const selectable = Boolean(
            connection?.connected && installed && status?.supported,
          );
          const isSelected = selected.includes(app);
          const availableModels = compatibleModels();
          const selectedModel =
            models[app] ?? status?.recommendedModel ?? undefined;
          const availableGroups = selectedModel
            ? (connection?.modelGroups[selectedModel] ?? [])
            : [];
          const selectedGroup = selectedModel
            ? preferredGroup(selectedModel, groups[app])
            : undefined;
          const supportedReasoning = selectedModel
            ? (connection?.reasoningLevels[selectedModel] ?? [])
            : [];
          const defaultReasoning = selectedModel
            ? connection?.reasoningDefaults?.[selectedModel]
            : undefined;
          const reasoningOptions: YuanhengReasoningLevel[] = [
            "auto",
            ...supportedReasoning,
          ];
          const selectedReasoning = selectedReasoningFor(app, selectedModel);
          const controlsReasoning =
            app === "claude-desktop" ||
            app === "codex" ||
            app === "chatgpt-desktop";
          const supportsCustomPath = isDesktopApp(app);
          const supportsLaunchDirectory = isYuanhengCliTool(app);
          const launchDirectory = launchDirectoryState.directories[app];
          const launchDirectoryPending =
            launchDirectoryState.pendingApps.has(app);
          const detectionLabel =
            version?.detection_source === "custom"
              ? dt("自定义路径")
              : version?.detection_source === "microsoft_store"
                ? "Microsoft Store"
                : version?.detection_source === "registry"
                  ? dt("注册表检测")
                  : version?.detection_source === "automatic"
                    ? dt("自动检测")
                    : dt("未检测到");
          const modelChanged =
            Boolean(
              selectedModel &&
                configured &&
                (selectedModel !== status?.model ||
                  (selectedGroup && selectedGroup !== status?.group)),
            ) ||
            Boolean(
              controlsReasoning &&
                configured &&
                selectedReasoning !== (status?.reasoning ?? "auto"),
            );
          return (
            <article
              key={app}
              className={cn(
                "animate-rise-in flex flex-col rounded-2xl border bg-card p-4 shadow-sm transition-colors",
                activeApp === app && "border-primary/35 ring-1 ring-primary/10",
                isSelected && "border-emerald-500/35",
              )}
              style={{ animationDelay: `${Math.min(index, 7) * 40}ms` }}
              onClick={() => {
                if (isCoreApp(app)) onSetActiveApp?.(app);
              }}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  aria-label={dt("选择 {{v0}}", { v0: toolLabel(app) })}
                  aria-pressed={isSelected}
                  disabled={!selectable}
                  className="mt-0.5 text-primary disabled:text-muted-foreground/35"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleSelected(app);
                  }}
                >
                  {isSelected ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/70">
                  <ProviderIcon
                    icon={
                      app === "codex" || app === "chatgpt-desktop"
                        ? "openai"
                        : app === "claude-desktop"
                          ? "claude"
                          : app
                    }
                    name={toolLabel(app)}
                    size={22}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-[15px] font-semibold">
                    {toolLabel(app)}
                  </h2>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                    {installed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <CircleOff className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="truncate text-muted-foreground">
                      {installed
                        ? version?.version || dt("桌面应用")
                        : dt("未检测到")}
                    </span>
                  </div>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[9px] font-semibold",
                    configured
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : status?.needsUpdate
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {configured
                    ? dt("已配置")
                    : status?.needsUpdate
                      ? dt("需更新")
                      : dt("待配置")}
                </span>
              </div>

              {supportsCustomPath && (
                <div className="mt-3 border-t border-border/60 pt-3 text-[10px]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "shrink-0 font-medium",
                        version?.detection_source === "not_found"
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-muted-foreground",
                      )}
                    >
                      {detectionLabel}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-muted-foreground"
                      title={
                        version?.install_path ?? version?.custom_path ?? ""
                      }
                    >
                      {version?.install_path ??
                        version?.custom_path ??
                        dt("尚未选择应用路径")}
                    </span>
                  </div>
                  {version?.custom_path && !version.custom_path_valid && (
                    <p className="mt-1 text-amber-700 dark:text-amber-300">
                      {dt("原自定义路径已失效，当前继续使用自动检测结果。")}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[10px]"
                      onClick={(event) => {
                        event.stopPropagation();
                        void chooseDesktopPath(app);
                      }}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      {version?.custom_path ? dt("重新选择") : dt("选择路径")}
                    </Button>
                    {version?.custom_path && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        title={dt("清除自定义路径")}
                        aria-label={dt("清除自定义路径")}
                        onClick={(event) => {
                          event.stopPropagation();
                          void clearDesktopPath(app);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {supportsLaunchDirectory && (
                <button
                  type="button"
                  disabled={launchDirectoryPending}
                  aria-label={dt("选择 {{tool}} 工作目录", {
                    tool: toolLabel(app),
                  })}
                  title={launchDirectory ?? dt("用户主目录")}
                  onClick={(event) => {
                    event.stopPropagation();
                    void chooseLaunchDirectory(app);
                  }}
                  className="mt-3 flex min-w-0 items-center gap-2 border-t border-border/60 pt-3 text-left text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {launchDirectoryPending ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="shrink-0 font-medium">{dt("工作目录")}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground/80">
                    {launchDirectoryLabel(launchDirectory)}
                  </span>
                </button>
              )}

              {status?.runtimeStatus && (
                <div
                  className={cn(
                    "mt-3 rounded-lg border px-3 py-2.5 text-[10px] leading-4",
                    status.runtimeStatus.state === "downloading"
                      ? "border-sky-500/25 bg-sky-500/[0.06] text-sky-800 dark:text-sky-200"
                      : "border-amber-500/25 bg-amber-500/[0.06] text-amber-800 dark:text-amber-200",
                  )}
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    {status.runtimeStatus.state === "downloading" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {status.runtimeStatus.title}
                  </div>
                  <p className="mt-1">{status.runtimeStatus.message}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 bg-background/70 px-2.5 text-[10px]"
                      onClick={(event) => {
                        event.stopPropagation();
                        void launchTool("claude-desktop");
                      }}
                    >
                      <Play className="h-3 w-3 fill-current" />
                      {dt("打开 Claude Desktop")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2.5 text-[10px]"
                      disabled={statuses.isFetching}
                      onClick={(event) => {
                        event.stopPropagation();
                        void statuses.refetch();
                      }}
                    >
                      <RefreshCw
                        className={cn(
                          "h-3 w-3",
                          statuses.isFetching && "animate-spin",
                        )}
                      />
                      {dt("重新检测")}
                    </Button>
                  </div>
                </div>
              )}

              {status?.runtimeWarning && !status.runtimeStatus && (
                <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[10px] leading-4 text-amber-800 dark:text-amber-200">
                  {status.runtimeWarning}
                </div>
              )}

              {installed && connection?.connected && status?.supported ? (
                <div className="mt-3 rounded-xl bg-muted/45 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold">
                      {isDesktopApp(app) ? dt("桌面模型") : dt("终端模型")}
                    </p>
                    <span className="text-[9px] text-muted-foreground">
                      {dt("可选")}
                      {availableModels.length} {dt("个 · 点击切换")}
                    </span>
                  </div>
                  <ModelPicker
                    models={availableModels}
                    value={selectedModel}
                    recommended={status.recommendedModel}
                    label={dt("{{v0}} 模型选择", { v0: toolLabel(app) })}
                    disabled={configure.isPending}
                    onRefresh={refreshModels}
                    onChange={(value) => {
                      if (app === "codex") {
                        void applyCodexModel(value);
                        return;
                      }
                      setModels((current) => ({ ...current, [app]: value }));
                      const group = preferredGroup(value);
                      setGroups((current) => {
                        const next = { ...current };
                        if (group) next[app] = group;
                        else delete next[app];
                        return next;
                      });
                      setReasoning((current) => {
                        const supported =
                          connection.reasoningLevels[value] ?? [];
                        const selected = current[app] ?? "auto";
                        if (
                          selected === "auto" ||
                          supported.includes(selected)
                        ) {
                          return current;
                        }
                        return { ...current, [app]: "auto" };
                      });
                    }}
                  />
                  {availableGroups.length > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-[10px]">
                      <span className="shrink-0 text-muted-foreground">
                        {dt("令牌分组")}
                      </span>
                      {availableGroups.length === 1 ? (
                        <span className="truncate font-medium">
                          {availableGroups[0]}
                          {groupMap.get(availableGroups[0])?.ratio != null &&
                            ` · ${groupMap.get(availableGroups[0])?.ratio}x`}
                        </span>
                      ) : (
                        <CompactSelectPicker
                          label={dt("{{v0}} 令牌分组", {
                            v0: toolLabel(app),
                          })}
                          triggerClassName="h-7 flex-1"
                          value={selectedGroup ?? ""}
                          options={availableGroups.map((group) => {
                            const option = groupMap.get(group);
                            return {
                              value: group,
                              label: `${group}${option?.ratio != null ? ` · ${option.ratio}x` : ""}`,
                            };
                          })}
                          onChange={(value) => {
                            setGroups((current) => ({
                              ...current,
                              [app]: value,
                            }));
                          }}
                        />
                      )}
                    </div>
                  )}
                  {controlsReasoning && (
                    <div className="mt-2 flex items-center gap-2 text-[10px]">
                      <span className="shrink-0 text-muted-foreground">
                        {dt("推理等级")}
                        {supportedReasoning.length > 0 &&
                          dt(" · {{v0}} 档", { v0: supportedReasoning.length })}
                      </span>
                      <CompactSelectPicker
                        label={dt("{{v0}} 推理等级", {
                          v0: toolLabel(app),
                        })}
                        triggerClassName="h-7 flex-1"
                        value={
                          supportedReasoning.length > 0
                            ? selectedReasoning
                            : "unsupported"
                        }
                        disabled={supportedReasoning.length === 0}
                        options={
                          supportedReasoning.length === 0
                            ? [{ value: "unsupported", label: dt("不适用") }]
                            : reasoningOptions.map((level) => ({
                                value: level,
                                label: reasoningLabel(level, defaultReasoning),
                              }))
                        }
                        onChange={(value) => {
                          setReasoning((current) => ({
                            ...current,
                            [app]: value as YuanhengReasoningLevel,
                          }));
                        }}
                      />
                    </div>
                  )}
                  {app === "claude-desktop" && (
                    <p className="mt-2 text-[9px] leading-4 text-amber-700 dark:text-amber-300">
                      {dt(
                        "右下角固定显示“元衡\n                      AI”；模型与推理等级在此切换，无需重启。",
                      )}
                    </p>
                  )}
                  {app === "codex" && (
                    <p className="mt-2 text-[9px] leading-4 text-muted-foreground">
                      {dt(
                        "从元衡启动后，模型会在同一会话的下一条消息自动切换，无需重启。",
                      )}
                    </p>
                  )}
                  {app === "chatgpt-desktop" && (
                    <p className="mt-2 text-[9px] leading-4 text-muted-foreground">
                      {dt("使用独立桌面配置；已有任务保持原模型，请新建任务。")}
                    </p>
                  )}
                  {app === "workbuddy" && (
                    <p className="mt-2 text-[9px] leading-4 text-muted-foreground">
                      {dt("写入 WorkBuddy 自定义模型；应用后会重新打开。")}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
                  {configured
                    ? dt("配置已就绪，可直接启动使用。")
                    : status?.needsUpdate
                      ? dt("配置发生变化，点击即可自动恢复。")
                      : installed
                        ? dt("元衡会自动选择适合的模型。")
                        : dt("安装后即可由元衡自动配置。")}
                </p>
              )}

              <div className="mt-auto flex gap-2 pt-3">
                {!installed && canInstall ? (
                  <Button
                    size="sm"
                    className="flex-1"
                    aria-label={
                      DESKTOP_DOWNLOAD_URLS[app]
                        ? dt("打开 {{v0}} 官方下载页", { v0: toolLabel(app) })
                        : dt("一键安装 {{v0}}", { v0: toolLabel(app) })
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      void installTool(app);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {DESKTOP_DOWNLOAD_URLS[app]
                      ? dt("官方下载")
                      : dt("一键安装")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={
                      !connection?.connected ||
                      !status?.supported ||
                      configure.isPending
                    }
                    aria-label={dt("配置 {{v0}}", { v0: toolLabel(app) })}
                    onClick={(event) => {
                      event.stopPropagation();
                      void configureApps([app]);
                    }}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    {modelChanged
                      ? dt("应用模型")
                      : status?.needsUpdate
                        ? dt("自动恢复")
                        : configured
                          ? dt("重新配置")
                          : dt("配置")}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    !installed ||
                    !connection?.connected ||
                    !status?.supported ||
                    configure.isPending
                  }
                  aria-label={dt("启动 {{v0}}", { v0: toolLabel(app) })}
                  onClick={(event) => {
                    event.stopPropagation();
                    void launchTool(app, isDesktopApp(app));
                  }}
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  {!configured || modelChanged
                    ? isDesktopApp(app)
                      ? dt("应用并刷新")
                      : dt("应用并启动")
                    : isDesktopApp(app)
                      ? dt("刷新显示")
                      : dt("启动")}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
