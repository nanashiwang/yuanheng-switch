import {
  ArrowRight,
  Blocks,
  Bot,
  Cloud,
  FolderKanban,
  Gauge,
  Network,
  Play,
  ServerCog,
  Sparkles,
} from "lucide-react";
import type { Profile } from "@/lib/api/profiles";
import type { AppId } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ProviderIcon } from "@/components/ProviderIcon";
import { APP_ICON_MAP } from "@/config/appConfig";
import {
  APP_PROFILE_SCOPE,
  hasScopeSnapshot,
} from "@/components/profiles/scope";
import { useInstalledSkills } from "@/hooks/useSkills";
import { useAllMcpServers } from "@/hooks/useMcp";
import { useYuanhengConnection } from "@/lib/query/yuanheng";
import type { DesktopView } from "./types";

interface WorkspaceDashboardProps {
  project?: Profile;
  activeApp: AppId;
  onNavigate: (view: DesktopView) => void;
  onLaunch: (tool?: AppId) => void;
}

const QUICK_TOOLS: AppId[] = ["claude", "codex", "gemini", "opencode"];

export function WorkspaceDashboard({
  project,
  activeApp,
  onNavigate,
  onLaunch,
}: WorkspaceDashboardProps) {
  const { data: connection } = useYuanhengConnection();
  const { data: skills = [] } = useInstalledSkills();
  const { data: mcpServers = {} } = useAllMcpServers();
  const defaultTool = project?.payload.project.defaultTool ?? activeApp;
  const defaultScope = APP_PROFILE_SCOPE[defaultTool];
  const hasProjectSnapshot = Boolean(
    project && defaultScope && hasScopeSnapshot(project, defaultScope),
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-[1120px] flex-col gap-5 overflow-y-auto px-7 pb-8 pt-6">
      <div className="animate-rise-in flex items-end justify-between gap-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            元衡工作台
          </p>
          <h1 className="font-display mt-1 text-[28px] font-semibold tracking-[-0.035em]">
            {project ? `继续 ${project.name}` : "从一个项目开始"}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            项目、工具和能力配置保持在同一个上下文中。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onNavigate("projects")}
        >
          <FolderKanban className="h-4 w-4" />
          管理项目
        </Button>
      </div>

      <section className="animate-rise-in stagger-1 relative overflow-hidden rounded-[22px] bg-[#173f3a] p-6 text-white shadow-[0_20px_50px_-28px_rgba(12,46,41,0.8)]">
        <div className="absolute -right-14 -top-20 h-64 w-64 rounded-full border border-white/10" />
        <div className="absolute -right-2 -top-8 h-44 w-44 rounded-full border border-white/10" />
        <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/70">
              <Gauge className="h-3.5 w-3.5" /> 当前项目
            </div>
            {project ? (
              <>
                <h2 className="font-display mt-3 truncate text-2xl font-semibold">
                  {project.name}
                </h2>
                <p className="mt-1 truncate font-mono text-[11px] text-emerald-100/55">
                  {project.payload.project.directory ?? "尚未绑定本地目录"}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] text-emerald-50">
                    <Bot className="h-3.5 w-3.5" />
                    {APP_ICON_MAP[defaultTool].label}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] text-emerald-50">
                    <Sparkles className="h-3.5 w-3.5" />
                    {hasProjectSnapshot
                      ? "配置快照已绑定"
                      : "首次切换时建立快照"}
                  </span>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-display mt-3 text-2xl font-semibold">
                  建立第一个项目上下文
                </h2>
                <p className="mt-2 max-w-xl text-[13px] leading-5 text-emerald-50/65">
                  选择目录、默认 AI 工具和能力快照，之后可以从工作台直接启动。
                </p>
              </>
            )}
          </div>
          <Button
            size="lg"
            className="bg-[#e9b67c] text-[#163a36] shadow-none hover:bg-[#f0c693]"
            onClick={() =>
              project ? onLaunch(defaultTool) : onNavigate("projects")
            }
          >
            {project ? (
              <Play className="h-4 w-4 fill-current" />
            ) : (
              <FolderKanban className="h-4 w-4" />
            )}
            {project ? "在项目中启动" : "创建项目"}
          </Button>
        </div>
      </section>

      <div className="grid animate-rise-in stagger-2 gap-4 lg:grid-cols-[1.55fr_1fr]">
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">快速启动</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                在当前项目目录打开常用工具
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("tools")}
            >
              全部工具 <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {QUICK_TOOLS.map((tool) => (
              <button
                key={tool}
                type="button"
                onClick={() => {
                  if (project) onLaunch(tool);
                  else onNavigate("projects");
                }}
                className="group flex items-center gap-3 rounded-xl border bg-background/55 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <ProviderIcon
                    icon={tool === "codex" ? "openai" : tool}
                    name={APP_ICON_MAP[tool].label}
                    size={20}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold">
                    {APP_ICON_MAP[tool].label}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    打开并运行
                  </span>
                </span>
                <Play className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">元衡连接</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                账号、余额与模型权限
              </p>
            </div>
            <span
              className={
                connection?.connected
                  ? "status-dot status-dot-online"
                  : "status-dot"
              }
            />
          </div>
          {connection?.connected ? (
            <div className="mt-5">
              <p className="font-display text-2xl font-semibold">
                ${connection.account?.remainingUsd.toFixed(2) ?? "0.00"}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                当前可用余额
              </p>
              <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-[11px]">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Cloud className="h-3.5 w-3.5" /> 模型目录
                </span>
                <span className="font-semibold">
                  {connection.models.length} 个可用
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed p-4 text-center">
              <Cloud className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-[12px] font-medium">尚未连接元衡账号</p>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            onClick={() => onNavigate("network")}
          >
            {connection?.connected ? "查看连接详情" : "立即连接"}
          </Button>
        </section>
      </div>

      <div className="grid animate-rise-in stagger-3 gap-3 sm:grid-cols-3">
        {[
          {
            title: "能力中心",
            value: `${skills.length} Skills · ${Object.keys(mcpServers).length} MCP`,
            icon: Blocks,
            view: "capabilities" as const,
          },
          {
            title: "连接与路由",
            value: "本地接管 · 故障转移",
            icon: Network,
            view: "network" as const,
          },
          {
            title: "工具状态",
            value: "安装、版本与配置",
            icon: ServerCog,
            view: "tools" as const,
          },
        ].map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => onNavigate(item.view)}
            className="group flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:border-primary/30"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.08] text-primary">
              <item.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold">
                {item.title}
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {item.value}
              </span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
          </button>
        ))}
      </div>
    </div>
  );
}
