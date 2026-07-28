import { useState } from "react";
import { ArrowRight, Blocks, Megaphone, ServerCog, X } from "lucide-react";
import { useInstalledSkills } from "@/hooks/useSkills";
import { useAllMcpServers } from "@/hooks/useMcp";
import {
  useYuanhengConnection,
  useYuanhengToolStatuses,
} from "@/lib/query/yuanheng";
import type { YuanhengToolId } from "@/lib/api";
import type { DesktopView } from "./types";
import { useModelSwitchCenter } from "./useModelSwitchCenter";
import { FocusToolCard } from "./FocusToolCard";
import { ModelSwitchCenter } from "./ModelSwitchCenter";
import { AccountUsageCard } from "./AccountUsageCard";
import { TodayStatsBand } from "./TodayStatsBand";
import { YuanhengHealthCard } from "./YuanhengHealthCard";

const NOTICE_DISMISS_KEY = "yuanheng.dashboard.notice-dismissed";
const NOTICE_SUMMARY_LIMIT = 220;

export function summarizeAnnouncement(raw: string): string {
  const source = raw.trim();
  if (!source) return "";
  if (!/<[a-z][\s\S]*>/i.test(source) || typeof DOMParser === "undefined") {
    return source.slice(0, NOTICE_SUMMARY_LIMIT);
  }

  const document = new DOMParser().parseFromString(source, "text/html");
  document
    .querySelectorAll("style, script, noscript, template")
    .forEach((node) => node.remove());

  const parts = Array.from(document.querySelectorAll("h1, h2, h3, p"))
    .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .filter(Boolean);
  const summary = (
    parts.length > 0 ? parts.slice(0, 2).join(" · ") : document.body.textContent
  )
    ?.replace(/\s+/g, " ")
    .trim();

  return (summary || "").slice(0, NOTICE_SUMMARY_LIMIT);
}

interface WorkspaceDashboardProps {
  focusApp?: YuanhengToolId;
  onNavigate: (view: DesktopView) => void;
}

export function WorkspaceDashboard({
  focusApp,
  onNavigate,
}: WorkspaceDashboardProps) {
  const switcher = useModelSwitchCenter();
  const { data: connection } = useYuanhengConnection();
  const { data: toolStatuses = [] } = useYuanhengToolStatuses();
  const { data: skills = [] } = useInstalledSkills();
  const { data: mcpServers = {} } = useAllMcpServers();
  const configuredTools = toolStatuses.filter((item) => item.configured);

  const announcement = connection?.connected ? connection.announcement : null;
  const announcementSummary = announcement
    ? summarizeAnnouncement(announcement)
    : "";
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(() =>
    sessionStorage.getItem(NOTICE_DISMISS_KEY),
  );
  const showNotice = Boolean(
    announcement && announcementSummary && announcement !== dismissedNotice,
  );
  const dismissNotice = () => {
    if (!announcement) return;
    sessionStorage.setItem(NOTICE_DISMISS_KEY, announcement);
    setDismissedNotice(announcement);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1120px] flex-col gap-3.5 overflow-y-auto px-7 pb-8 pt-4">
      <h1 className="sr-only">工作台</h1>

      {showNotice && announcement && (
        <div className="flex animate-rise-in items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-100/70 px-3.5 py-2 text-[11.5px] text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          <Megaphone className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{announcementSummary}</span>
          <button
            type="button"
            onClick={dismissNotice}
            aria-label="关闭公告"
            className="shrink-0 rounded p-0.5 text-amber-700/60 transition-colors hover:text-amber-800 dark:hover:text-amber-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="grid animate-rise-in items-start gap-4 lg:grid-cols-[1.58fr_1fr]">
        <FocusToolCard switcher={switcher} focusApp={focusApp} />
        <AccountUsageCard onOpenUsage={() => onNavigate("usage")} />
      </div>

      <div className="animate-rise-in stagger-1">
        <TodayStatsBand />
      </div>

      <div className="grid animate-rise-in stagger-2 items-start gap-4 lg:grid-cols-[1.58fr_1fr]">
        <ModelSwitchCenter
          switcher={switcher}
          onOpenTools={() => onNavigate("tools")}
        />
        <div className="flex flex-col gap-4">
          <YuanhengHealthCard
            compact
            onOpenConnection={() => onNavigate("network")}
            onConfigureTools={() => onNavigate("tools")}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                title: "能力中心",
                value: `${skills.length} Skills · ${Object.keys(mcpServers).length} MCP`,
                icon: Blocks,
                view: "capabilities" as const,
              },
              {
                title: "工具管理",
                value: `${configuredTools.length} 个已就绪`,
                icon: ServerCog,
                view: "tools" as const,
              },
            ].map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => onNavigate(item.view)}
                className="group flex items-center gap-2.5 rounded-xl border bg-card px-3.5 py-3 text-left transition-colors hover:border-primary/30"
              >
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-primary/[0.08] text-primary">
                  <item.icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] font-semibold">
                    {item.title}
                  </span>
                  <span className="block truncate text-[9.5px] text-muted-foreground">
                    {item.value}
                  </span>
                </span>
                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground group-hover:text-primary" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
