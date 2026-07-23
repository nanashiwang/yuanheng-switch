import {
  ArrowRight,
  Blocks,
  CheckCircle2,
  Cloud,
  Gauge,
  Play,
  ServerCog,
  Settings2,
} from "lucide-react";
import type { AppId } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ProviderIcon } from "@/components/ProviderIcon";
import { APP_ICON_MAP } from "@/config/appConfig";
import { useInstalledSkills } from "@/hooks/useSkills";
import { useAllMcpServers } from "@/hooks/useMcp";
import {
  useYuanhengConnection,
  useYuanhengToolStatuses,
} from "@/lib/query/yuanheng";
import type { DesktopView } from "./types";
import { YuanhengHealthCard } from "./YuanhengHealthCard";

interface WorkspaceDashboardProps {
  onNavigate: (view: DesktopView) => void;
  onLaunch: (tool: AppId) => void;
}

const QUICK_TOOLS: AppId[] = ["claude", "codex", "gemini", "opencode"];

export function WorkspaceDashboard({
  onNavigate,
  onLaunch,
}: WorkspaceDashboardProps) {
  const { data: connection } = useYuanhengConnection();
  const { data: toolStatuses = [] } = useYuanhengToolStatuses();
  const { data: skills = [] } = useInstalledSkills();
  const { data: mcpServers = {} } = useAllMcpServers();
  const configuredTools = toolStatuses.filter((item) => item.configured);
  const configuredIds = new Set(configuredTools.map((item) => item.app));

  return (
    <div className="mx-auto flex h-full w-full max-w-[1120px] flex-col gap-5 overflow-y-auto px-7 pb-8 pt-6">
      <div className="animate-rise-in flex items-end justify-between gap-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            元衡工具中心
          </p>
          <h1 className="mt-1 font-display text-[28px] font-semibold tracking-[-0.035em]">
            让需要的 AI 工具立即可用
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            连接一次元衡账号，统一完成本机工具的 API 和模型配置。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onNavigate("tools")}>
          <Settings2 className="h-4 w-4" />
          配置工具
        </Button>
      </div>

      <section className="animate-rise-in stagger-1 relative overflow-hidden rounded-[22px] bg-[#173f3a] p-6 text-white shadow-[0_20px_50px_-28px_rgba(12,46,41,0.8)]">
        <div className="absolute -right-14 -top-20 h-64 w-64 rounded-full border border-white/10" />
        <div className="absolute -right-2 -top-8 h-44 w-44 rounded-full border border-white/10" />
        <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/70">
              <Gauge className="h-3.5 w-3.5" /> 配置状态
            </div>
            <h2 className="mt-3 font-display text-2xl font-semibold">
              {connection?.connected
                ? configuredTools.length > 0
                  ? `${configuredTools.length} 个工具已经就绪`
                  : "元衡已连接，等待配置工具"
                : "先连接你的元衡账号"}
            </h2>
            <p className="mt-2 max-w-xl text-[13px] leading-5 text-emerald-50/65">
              {connection?.connected
                ? "选择本机需要使用的工具，元衡会自动推荐模型并写入对应配置。"
                : "连接后将同步账号额度和模型目录，无需手动填写每个工具的 API 地址。"}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] text-emerald-50">
                <Cloud className="h-3.5 w-3.5" />
                {connection?.connected ? "元衡服务在线" : "尚未连接"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] text-emerald-50">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {configuredTools.length > 0
                  ? `${configuredTools.length} 个工具已就绪`
                  : "等待配置工具"}
              </span>
            </div>
          </div>
          <Button
            size="lg"
            className="bg-[#e9b67c] text-[#163a36] shadow-none hover:bg-[#f0c693]"
            onClick={() =>
              onNavigate(connection?.connected ? "tools" : "network")
            }
          >
            {connection?.connected ? (
              <Settings2 className="h-4 w-4" />
            ) : (
              <Cloud className="h-4 w-4" />
            )}
            {connection?.connected ? "选择并配置工具" : "连接元衡"}
          </Button>
        </div>
      </section>

      <div className="grid animate-rise-in stagger-2 gap-4 lg:grid-cols-[1.55fr_1fr]">
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">常用工具</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                配置完成后可直接启动
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
            {QUICK_TOOLS.map((tool) => {
              const ready = configuredIds.has(tool);
              return (
                <button
                  key={tool}
                  type="button"
                  onClick={() => (ready ? onLaunch(tool) : onNavigate("tools"))}
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
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      {ready && (
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      )}
                      {ready ? "已配置" : "点击配置"}
                    </span>
                  </span>
                  {ready ? (
                    <Play className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
                  ) : (
                    <Settings2 className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <YuanhengHealthCard
          onOpenConnection={() => onNavigate("network")}
          onConfigureTools={() => onNavigate("tools")}
        />
      </div>

      <div className="grid animate-rise-in stagger-3 gap-3 sm:grid-cols-2">
        {[
          {
            title: "能力中心",
            value: `${skills.length} Skills · ${Object.keys(mcpServers).length} MCP`,
            icon: Blocks,
            view: "capabilities" as const,
          },
          {
            title: "工具配置",
            value: `${configuredTools.length} 个已就绪`,
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
