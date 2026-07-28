import {
  Activity,
  Blocks,
  Bot,
  Boxes,
  ChevronRight,
  Gauge,
  Network,
  Settings,
  UserRound,
  WalletCards,
  Wrench,
} from "lucide-react";
import appIcon from "@/assets/icons/app-icon.png";
import type { YuanhengConnectionStatus } from "@/lib/api/yuanheng";
import { cn } from "@/lib/utils";
import type { DesktopView } from "./types";
import { desktopSection } from "./types";

interface DesktopSidebarProps {
  view: DesktopView;
  onNavigate: (view: DesktopView) => void;
  connection?: YuanhengConnectionStatus;
  proxyRunning: boolean;
}

const dailyItems = [
  { id: "home" as const, label: "工作台", icon: Gauge },
  { id: "tools" as const, label: "工具管理", icon: Bot },
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
  connection,
  proxyRunning,
}: DesktopSidebarProps) {
  const active = desktopSection(view);
  const accountName =
    connection?.account?.displayName ||
    connection?.account?.username ||
    (connection?.userId ? `用户 ${connection.userId}` : "元衡用户");
  const balance = connection?.account?.remainingUsd ?? 0;

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
            AI WORKSPACE
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

      <div className="mt-auto space-y-2">
        <button
          type="button"
          onClick={() => onNavigate("network")}
          className="group w-full rounded-xl border border-white/[0.09] bg-white/[0.055] p-3 text-left transition-colors hover:bg-white/[0.09]"
          aria-label="账号与余额"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#d69554]/15 text-[#e3aa70]">
              <UserRound className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-semibold text-slate-200">
                {accountName}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[9px] text-emerald-400/80">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                已登录
              </span>
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-600 transition-colors group-hover:text-slate-300" />
          </div>
          <div className="mt-3 border-t border-white/[0.07] pt-2.5">
            <span className="flex items-center gap-1.5 text-[9px] text-slate-500">
              <WalletCards className="h-3 w-3" /> 可用余额
            </span>
            <strong className="mt-0.5 block font-display text-[17px] font-semibold tracking-[-0.02em] text-white">
              ${balance.toFixed(2)}
            </strong>
          </div>
        </button>

        <div className="flex items-center gap-2 px-2 text-[10px] text-slate-600">
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
