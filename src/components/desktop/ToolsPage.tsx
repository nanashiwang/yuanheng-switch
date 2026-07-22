import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleOff,
  Download,
  ExternalLink,
  Play,
  RefreshCw,
  Settings2,
  TerminalSquare,
} from "lucide-react";
import { toast } from "sonner";
import type { Profile } from "@/lib/api/profiles";
import type { AppId } from "@/lib/api";
import { providersApi, settingsApi } from "@/lib/api";
import { APP_ICON_MAP } from "@/config/appConfig";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errorUtils";
import { PageHeader } from "./PageHeader";
import type { DesktopView } from "./types";

interface ToolsPageProps {
  project?: Profile;
  activeApp: AppId;
  visibleApps: Partial<Record<AppId, boolean>>;
  onSetActiveApp: (app: AppId) => void;
  onLaunch: (tool: AppId) => void;
  onNavigate: (view: DesktopView) => void;
}

const TOOLS: AppId[] = [
  "claude",
  "claude-desktop",
  "codex",
  "gemini",
  "grokbuild",
  "opencode",
  "openclaw",
  "hermes",
];

const CLI_NAME: Partial<Record<AppId, string>> = {
  claude: "claude",
  codex: "codex",
  gemini: "gemini",
  grokbuild: "grok",
  opencode: "opencode",
  openclaw: "openclaw",
  hermes: "hermes",
};

interface ToolConnection {
  configured: boolean;
  yuanheng: boolean;
}

export function ToolsPage({
  project,
  activeApp,
  visibleApps,
  onSetActiveApp,
  onLaunch,
  onNavigate,
}: ToolsPageProps) {
  const queryClient = useQueryClient();
  const cliTools = Object.values(CLI_NAME);
  const versions = useQuery({
    queryKey: ["desktop", "tool-versions"],
    queryFn: () => settingsApi.getToolVersions(cliTools),
  });
  const connections = useQuery({
    queryKey: ["desktop", "tool-connections"],
    queryFn: async () => {
      const entries = await Promise.all(
        TOOLS.map(async (app) => {
          try {
            const [providers, currentId] = await Promise.all([
              providersApi.getAll(app),
              providersApi.getCurrent(app),
            ]);
            const current = providers[currentId];
            const json = JSON.stringify(current ?? {}).toLowerCase();
            return [
              app,
              {
                configured: Boolean(current),
                yuanheng: json.includes("cn.meta-api.vip"),
              } satisfies ToolConnection,
            ] as const;
          } catch {
            return [
              app,
              { configured: false, yuanheng: false } satisfies ToolConnection,
            ] as const;
          }
        }),
      );
      return Object.fromEntries(entries) as Record<AppId, ToolConnection>;
    },
  });

  const versionMap = useMemo(
    () => new Map((versions.data ?? []).map((item) => [item.name, item])),
    [versions.data],
  );

  const refresh = async () => {
    await Promise.all([
      versions.refetch(),
      queryClient.invalidateQueries({
        queryKey: ["desktop", "tool-connections"],
      }),
    ]);
  };

  const installTool = async (app: AppId) => {
    const command = CLI_NAME[app];
    if (!command) return;
    try {
      await settingsApi.runToolLifecycleAction([command], "install");
      toast.success(`${APP_ICON_MAP[app].label} 安装任务已完成`);
      await versions.refetch();
    } catch (error) {
      toast.error(extractErrorMessage(error) || "安装失败");
    }
  };

  const tools = TOOLS.filter((tool) => visibleApps[tool] !== false);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1120px] flex-col overflow-hidden px-7 pt-6">
      <PageHeader
        eyebrow="Local AI Tools"
        title="AI 工具"
        description="查看本机工具状态，并从当前项目目录直接启动。连接由元衡统一下发。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={versions.isFetching}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                versions.isFetching && "animate-spin",
              )}
            />{" "}
            刷新
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tools.map((app, index) => {
            const command = CLI_NAME[app];
            const version = command ? versionMap.get(command) : undefined;
            const isInstalled =
              app === "claude-desktop" || Boolean(version?.version);
            const connection = connections.data?.[app];
            const isActive = activeApp === app;
            return (
              <article
                key={app}
                className={cn(
                  "animate-rise-in flex min-h-[214px] flex-col rounded-2xl border bg-card p-4 shadow-sm transition-colors",
                  isActive && "border-primary/35 ring-1 ring-primary/10",
                )}
                style={{ animationDelay: `${Math.min(index, 7) * 40}ms` }}
                onClick={() => onSetActiveApp(app)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted/70">
                    <ProviderIcon
                      icon={
                        app === "codex"
                          ? "openai"
                          : app === "claude-desktop"
                            ? "claude"
                            : app
                      }
                      name={APP_ICON_MAP[app].label}
                      size={23}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-display text-[15px] font-semibold">
                      {APP_ICON_MAP[app].label}
                    </h2>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                      {isInstalled ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <CircleOff className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span
                        className={
                          isInstalled
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground"
                        }
                      >
                        {isInstalled
                          ? version?.version || "桌面应用"
                          : "未检测到"}
                      </span>
                    </div>
                  </div>
                  {isActive && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold text-primary">
                      当前
                    </span>
                  )}
                </div>

                <div className="mt-4 rounded-xl bg-muted/50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    当前连接
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        connection?.yuanheng
                          ? "bg-emerald-500"
                          : connection?.configured
                            ? "bg-amber-500"
                            : "bg-muted-foreground/40",
                      )}
                    />
                    <p className="min-w-0 flex-1 truncate text-[11px] font-medium">
                      {connection?.yuanheng
                        ? "元衡项目连接"
                        : connection?.configured
                          ? "本地配置已就绪"
                          : "尚未配置"}
                    </p>
                  </div>
                </div>

                <div className="mt-auto flex gap-2 pt-4">
                  {!isInstalled && command ? (
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
                  ) : app === "claude-desktop" ? (
                    <Button
                      size="sm"
                      className="flex-1"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        onNavigate("network");
                      }}
                    >
                      <Settings2 className="h-3.5 w-3.5" /> 配置连接
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={!project?.payload.project.directory}
                      onClick={(event) => {
                        event.stopPropagation();
                        onLaunch(app);
                      }}
                    >
                      <Play className="h-3.5 w-3.5 fill-current" /> 在项目中启动
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    title="打开连接与配置"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSetActiveApp(app);
                      onNavigate("network");
                    }}
                  >
                    {connection?.configured ? (
                      <ExternalLink className="h-3.5 w-3.5" />
                    ) : (
                      <TerminalSquare className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
        {!project && (
          <button
            type="button"
            onClick={() => onNavigate("projects")}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-[12px] text-muted-foreground hover:border-primary/30 hover:text-foreground"
          >
            <TerminalSquare className="h-4 w-4" />{" "}
            先选择一个项目，即可从对应目录启动工具
          </button>
        )}
      </div>
    </div>
  );
}
