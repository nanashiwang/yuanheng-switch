import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  CircleOff,
  Download,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import type { AppId } from "@/lib/api";
import { settingsApi, yuanhengApi } from "@/lib/api";
import {
  useConfigureYuanhengTools,
  useYuanhengConnection,
  useYuanhengToolStatuses,
} from "@/lib/query/yuanheng";
import { APP_ICON_MAP } from "@/config/appConfig";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errorUtils";

export const DESKTOP_TOOLS: AppId[] = [
  "claude",
  "claude-desktop",
  "codex",
  "gemini",
  "grokbuild",
  "opencode",
  "openclaw",
  "hermes",
];

export const TOOL_COMMANDS: Partial<Record<AppId, string>> = {
  claude: "claude",
  codex: "codex",
  gemini: "gemini",
  grokbuild: "grok",
  opencode: "opencode",
  openclaw: "openclaw",
  hermes: "hermes",
};

interface ToolSetupGridProps {
  activeApp?: AppId;
  visibleApps?: Partial<Record<AppId, boolean>>;
  compact?: boolean;
  onSetActiveApp?: (app: AppId) => void;
  onConfigured?: () => void;
}

export function ToolSetupGrid({
  activeApp,
  visibleApps,
  compact = false,
  onSetActiveApp,
  onConfigured,
}: ToolSetupGridProps) {
  const { data: connection } = useYuanhengConnection();
  const statuses = useYuanhengToolStatuses();
  const configure = useConfigureYuanhengTools();
  const versions = useQuery({
    queryKey: ["desktop", "tool-versions"],
    queryFn: () => settingsApi.getToolVersions(Object.values(TOOL_COMMANDS)),
  });
  const [selected, setSelected] = useState<AppId[]>([]);
  const [models, setModels] = useState<Partial<Record<AppId, string>>>({});
  const selectionInitialized = useRef(false);

  const versionMap = useMemo(
    () => new Map((versions.data ?? []).map((item) => [item.name, item])),
    [versions.data],
  );
  const statusMap = useMemo(
    () => new Map((statuses.data ?? []).map((item) => [item.app, item])),
    [statuses.data],
  );
  const tools = DESKTOP_TOOLS.filter((app) => visibleApps?.[app] !== false);

  useEffect(() => {
    if (!statuses.data) return;
    setModels((current) => {
      const next = { ...current };
      for (const status of statuses.data) {
        const model = status.model ?? status.recommendedModel;
        if (!next[status.app] && model) next[status.app] = model;
      }
      return next;
    });
  }, [statuses.data]);

  useEffect(() => {
    if (selectionInitialized.current || !versions.data || !statuses.data)
      return;
    const defaults = tools.filter((app) => {
      if (app === "claude-desktop") return false;
      const command = TOOL_COMMANDS[app];
      return Boolean(
        command &&
          versionMap.get(command)?.version &&
          statusMap.get(app)?.supported,
      );
    });
    setSelected(defaults);
    selectionInitialized.current = true;
  }, [statusMap, statuses.data, tools, versionMap, versions.data]);

  const isInstalled = (app: AppId) => {
    if (app === "claude-desktop") return true;
    const command = TOOL_COMMANDS[app];
    return Boolean(command && versionMap.get(command)?.version);
  };

  const compatibleModels = (app: AppId) => {
    const available = connection?.models ?? [];
    if (app === "claude-desktop") {
      return available.filter((model) =>
        model.toLowerCase().includes("claude"),
      );
    }
    return available;
  };

  const configureApps = async (apps: AppId[]) => {
    try {
      const selectedModels = Object.fromEntries(
        apps
          .map((app) => [app, models[app]])
          .filter((entry): entry is [AppId, string] => Boolean(entry[1])),
      ) as Partial<Record<AppId, string>>;
      const results = await configure.mutateAsync({
        apps,
        models: selectedModels,
      });
      const succeeded = results.filter((item) => item.configured);
      const failed = results.filter((item) => !item.configured);
      if (succeeded.length > 0) {
        toast.success(`已完成 ${succeeded.length} 个工具的元衡配置`);
        onConfigured?.();
      }
      if (failed.length > 0) {
        toast.error(
          failed
            .map(
              (item) =>
                `${APP_ICON_MAP[item.app]?.label ?? item.app}：${item.error ?? "配置失败"}`,
            )
            .join("；"),
        );
      }
    } catch (error) {
      toast.error(extractErrorMessage(error) || "工具配置失败");
    }
  };

  const installTool = async (app: AppId) => {
    const command = TOOL_COMMANDS[app];
    if (!command) return;
    try {
      await settingsApi.runToolLifecycleAction([command], "install");
      toast.success(`${APP_ICON_MAP[app].label} 安装任务已完成`);
      await versions.refetch();
    } catch (error) {
      toast.error(extractErrorMessage(error) || "安装失败");
    }
  };

  const launchTool = async (app: AppId) => {
    try {
      await yuanhengApi.launchTool(app);
      toast.success(`${APP_ICON_MAP[app].label} 已启动`);
    } catch (error) {
      toast.error(extractErrorMessage(error) || "启动失败");
    }
  };

  const toggleSelected = (app: AppId) => {
    setSelected((current) =>
      current.includes(app)
        ? current.filter((item) => item !== app)
        : [...current, app],
    );
  };

  const refresh = async () => {
    await Promise.all([versions.refetch(), statuses.refetch()]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold">
            {selected.length > 0
              ? `已选择 ${selected.length} 个工具`
              : "选择你需要使用的工具"}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            元衡将写入 API、模型和认证配置，不修改工作目录。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={versions.isFetching || statuses.isFetching}
          aria-label="刷新工具状态"
        >
          <RefreshCw
            className={cn(
              "h-3.5 w-3.5",
              (versions.isFetching || statuses.isFetching) && "animate-spin",
            )}
          />
          刷新
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
          一键配置所选工具
        </Button>
      </div>

      {!connection?.connected && (
        <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/[0.055] px-4 py-3 text-[11px] text-amber-800 dark:text-amber-200">
          请先连接元衡账号，再为工具写入配置。
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
          const version = command ? versionMap.get(command) : undefined;
          const installed = isInstalled(app);
          const status = statusMap.get(app);
          const configured = Boolean(status?.configured);
          const selectable = Boolean(
            connection?.connected && installed && status?.supported,
          );
          const isSelected = selected.includes(app);
          const availableModels = compatibleModels(app);
          return (
            <article
              key={app}
              className={cn(
                "animate-rise-in flex min-h-[246px] flex-col rounded-2xl border bg-card p-4 shadow-sm transition-colors",
                activeApp === app && "border-primary/35 ring-1 ring-primary/10",
                isSelected && "border-emerald-500/35",
              )}
              style={{ animationDelay: `${Math.min(index, 7) * 40}ms` }}
              onClick={() => onSetActiveApp?.(app)}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  aria-label={`选择 ${APP_ICON_MAP[app].label}`}
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
                      app === "codex"
                        ? "openai"
                        : app === "claude-desktop"
                          ? "claude"
                          : app
                    }
                    name={APP_ICON_MAP[app].label}
                    size={22}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-[15px] font-semibold">
                    {APP_ICON_MAP[app].label}
                  </h2>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                    {installed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <CircleOff className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="truncate text-muted-foreground">
                      {installed ? version?.version || "桌面应用" : "未检测到"}
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
                    ? "已配置"
                    : status?.needsUpdate
                      ? "需更新"
                      : "待配置"}
                </span>
              </div>

              <div className="mt-4 rounded-xl bg-muted/45 p-3">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  使用模型
                </p>
                {connection?.connected && status?.supported ? (
                  <Select
                    value={models[app] ?? status.recommendedModel ?? undefined}
                    onValueChange={(value) =>
                      setModels((current) => ({ ...current, [app]: value }))
                    }
                  >
                    <SelectTrigger
                      className="mt-1.5 h-8 bg-background text-[11px]"
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`${APP_ICON_MAP[app].label} 模型`}
                    >
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                    {status?.message ?? "连接元衡后自动推荐"}
                  </p>
                )}
              </div>

              <div className="mt-auto flex gap-2 pt-4">
                {!installed && command ? (
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={(event) => {
                      event.stopPropagation();
                      void installTool(app);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" /> 安装
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
                    aria-label={`配置 ${APP_ICON_MAP[app].label}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void configureApps([app]);
                    }}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    {configured ? "重新配置" : "配置"}
                  </Button>
                )}
                {app !== "claude-desktop" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!installed || !configured}
                    aria-label={`启动 ${APP_ICON_MAP[app].label}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void launchTool(app);
                    }}
                  >
                    <Play className="h-3.5 w-3.5 fill-current" /> 启动
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
