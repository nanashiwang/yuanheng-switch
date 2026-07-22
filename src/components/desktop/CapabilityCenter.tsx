import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  Boxes,
  BookOpenText,
  CheckCircle2,
  Compass,
  PackageCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { Profile } from "@/lib/api/profiles";
import type { AppId } from "@/lib/api";
import { promptsApi } from "@/lib/api";
import { useInstalledSkills } from "@/hooks/useSkills";
import { useAllMcpServers } from "@/hooks/useMcp";
import { APP_ICON_MAP } from "@/config/appConfig";
import { Button } from "@/components/ui/button";
import { PageHeader } from "./PageHeader";
import type { DesktopView } from "./types";

interface CapabilityCenterProps {
  project?: Profile;
  activeApp: AppId;
  onOpen: (view: DesktopView) => void;
}

const snapshotValue = <T,>(
  profile: Profile | undefined,
  field: "skills" | "mcp" | "prompts",
  app: AppId,
): T | null => {
  return profile?.payload[field][app] as T | null;
};

export function CapabilityCenter({
  project,
  activeApp,
  onOpen,
}: CapabilityCenterProps) {
  const { data: skills = [] } = useInstalledSkills();
  const { data: mcpServers = {} } = useAllMcpServers();
  const { data: prompts = {} } = useQuery({
    queryKey: ["prompts", activeApp],
    queryFn: () => promptsApi.getPrompts(activeApp),
  });
  const projectSkillIds =
    snapshotValue<string[]>(project, "skills", activeApp) ?? [];
  const projectMcpIds =
    snapshotValue<string[]>(project, "mcp", activeApp) ?? [];
  const projectPromptId = snapshotValue<string>(project, "prompts", activeApp);

  const cards = [
    {
      title: "Skills",
      description: "给 AI 工具安装可复用的专业能力",
      value: skills.length,
      projectValue: projectSkillIds.length,
      icon: Wrench,
      color: "bg-[#d69554]/10 text-[#bd7736]",
      view: "skills" as const,
    },
    {
      title: "MCP",
      description: "连接文件、数据库和外部服务",
      value: Object.keys(mcpServers).length,
      projectValue: projectMcpIds.length,
      icon: Boxes,
      color: "bg-emerald-500/10 text-emerald-600",
      view: "mcp" as const,
    },
    {
      title: "Prompts",
      description: "按工具维护系统提示词和指令",
      value: Object.keys(prompts).length,
      projectValue: projectPromptId ? 1 : 0,
      icon: BookOpenText,
      color: "bg-sky-500/10 text-sky-600",
      view: "prompts" as const,
    },
    {
      title: "Agents",
      description: "自治代理编排能力仍在建设中",
      value: 0,
      projectValue: 0,
      icon: Bot,
      color: "bg-slate-500/10 text-slate-500",
      view: "agents" as const,
    },
  ];

  return (
    <div className="mx-auto flex h-full w-full max-w-[1120px] flex-col overflow-hidden px-7 pt-6">
      <PageHeader
        eyebrow="Capability Center"
        title="能力中心"
        description={`统一管理 ${APP_ICON_MAP[activeApp].label} 的 Skills、MCP、提示词与 Agent 能力，并随项目快照切换。`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpen("skillsDiscovery")}
          >
            <Compass className="h-4 w-4" /> 发现能力
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        <section className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm">
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-primary/[0.06] to-transparent" />
          <div className="relative flex flex-wrap items-center gap-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-base font-semibold">
                {project?.name ?? "未选择项目"}
              </h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {project
                  ? `当前快照绑定 ${projectSkillIds.length} 个 Skills、${projectMcpIds.length} 个 MCP`
                  : "选择项目后，启用状态会自动进入项目快照"}
              </p>
            </div>
            {project && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> 快照已启用
              </span>
            )}
          </div>
        </section>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {cards.map((card, index) => (
            <button
              key={card.title}
              type="button"
              onClick={() => onOpen(card.view)}
              className="animate-rise-in group rounded-2xl border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.color}`}
                >
                  <card.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-display text-base font-semibold">
                      {card.title}
                    </h2>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    {card.description}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-muted/55 px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    已安装
                  </p>
                  <p className="mt-0.5 font-display text-lg font-semibold">
                    {card.value}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/55 px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    当前项目
                  </p>
                  <p className="mt-0.5 font-display text-lg font-semibold">
                    {card.projectValue}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onOpen("skillsDiscovery")}
          className="mt-4 flex w-full items-center gap-3 rounded-xl border border-dashed bg-background/30 px-4 py-3 text-left transition-colors hover:border-primary/35"
        >
          <PackageCheck className="h-4 w-4 text-primary" />
          <span className="flex-1 text-[11px] text-muted-foreground">
            从技能仓库发现并安装新能力；安装后可按项目启用。
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
