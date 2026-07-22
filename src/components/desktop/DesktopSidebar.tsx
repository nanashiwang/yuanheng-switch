import {
  Activity,
  Blocks,
  Bot,
  Boxes,
  ChevronRight,
  FolderKanban,
  Gauge,
  Network,
  Settings,
  Sparkles,
  Wrench,
} from "lucide-react";
import appIcon from "@/assets/icons/app-icon.png";
import { cn } from "@/lib/utils";
import type { DesktopView } from "./types";
import { desktopSection } from "./types";

interface DesktopSidebarProps {
  view: DesktopView;
  onNavigate: (view: DesktopView) => void;
  connected: boolean;
  proxyRunning: boolean;
}

const dailyItems = [
  { id: "home" as const, label: "工作台", icon: Gauge },
  { id: "projects" as const, label: "项目", icon: FolderKanban },
  { id: "tools" as const, label: "AI 工具", icon: Bot },
  { id: "capabilities" as const, label: "能力中心", icon: Blocks },
  { id: "usage" as const, label: "会话与用量", icon: Activity },
];

const professionalItems = [
  { id: "network" as const, label: "连接与路由", icon: Network },
  { id: "settings" as const, label: "设置", icon: Settings },
];

export function DesktopSidebar({
  view,
  onNavigate,
  connected,
  proxyRunning,
}: DesktopSidebarProps) {
  const active = desktopSection(view);

  const renderItem = ({
    id,
    label,
    icon: Icon,
  }: (typeof dailyItems)[number] | (typeof professionalItems)[number]) => {
    const selected = active === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => onNavigate(id)}
        className={cn(
          "group flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] font-medium transition-colors",
          selected
            ? "bg-white text-slate-950 shadow-sm"
            : "text-slate-400 hover:bg-white/[0.07] hover:text-white",
        )}
        aria-current={selected ? "page" : undefined}
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
        <span className="flex-1">{label}</span>
        {selected && <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
      </button>
    );
  };

  return (
    <aside className="flex h-full w-[212px] shrink-0 flex-col border-r border-white/[0.06] bg-[#11191b] px-3 pb-3 pt-4 text-white">
      <div className="flex items-center gap-2.5 px-2 pb-5">
        <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/10">
          <img src={appIcon} alt="" className="h-8 w-8 object-contain" />
          <span className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border-2 border-[#11191b] bg-[#d69554]" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-[15px] font-semibold tracking-wide">
            元衡桌面端
          </p>
          <p className="mt-0.5 text-[10px] tracking-[0.16em] text-slate-500">
            PROJECT COMPANION
          </p>
        </div>
      </div>

      <nav className="space-y-1">
        <p className="px-3 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-600">
          日常使用
        </p>
        {dailyItems.map(renderItem)}
      </nav>

      <nav className="mt-5 space-y-1">
        <p className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-600">
          专业控制
        </p>
        {professionalItems.map(renderItem)}
      </nav>

      <div className="mt-auto rounded-xl border border-white/[0.07] bg-white/[0.035] p-3">
        <div className="flex items-center gap-2 text-[11px] font-medium text-slate-300">
          <Sparkles className="h-3.5 w-3.5 text-[#d69554]" />
          元衡服务
          <span
            className={cn(
              "ml-auto h-1.5 w-1.5 rounded-full",
              connected ? "bg-emerald-400" : "bg-slate-600",
            )}
          />
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
          {proxyRunning ? (
            <Boxes className="h-3.5 w-3.5" />
          ) : (
            <Wrench className="h-3.5 w-3.5" />
          )}
          {proxyRunning ? "本地路由运行中" : "本地路由未启动"}
        </div>
      </div>
    </aside>
  );
}
