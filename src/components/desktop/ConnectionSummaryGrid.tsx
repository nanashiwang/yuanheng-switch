import {
  Cable,
  Network,
  Route,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { YuanhengConnectionStatus } from "@/lib/api/yuanheng";
import type { SettingsFormState } from "@/hooks/useSettings";
import { useProxyStatus } from "@/hooks/useProxyStatus";
import { cn } from "@/lib/utils";

interface ConnectionSummaryGridProps {
  connection?: YuanhengConnectionStatus;
  settings: SettingsFormState;
}

export function ConnectionSummaryGrid({
  connection,
  settings,
}: ConnectionSummaryGridProps) {
  const { status, isRunning, isTakeoverActive } = useProxyStatus();
  const items = [
    {
      icon: Cable,
      label: "元衡连接",
      value: connection?.connected ? "已连接" : "未连接",
      detail:
        connection?.account?.displayName || connection?.baseUrl || "远程服务",
      active: Boolean(connection?.connected),
    },
    {
      icon: Network,
      label: "本地路由",
      value: isRunning ? "运行中" : "未启动",
      detail:
        isRunning && status?.port ? `127.0.0.1:${status.port}` : "请求直连上游",
      active: isRunning,
    },
    {
      icon: Route,
      label: "应用接管",
      value: isTakeoverActive ? "已启用" : "未启用",
      detail: isTakeoverActive ? "已接管至少一个 AI 工具" : "应用配置保持原状",
      active: Boolean(isTakeoverActive),
    },
    {
      icon: ShieldCheck,
      label: "故障转移",
      value: settings.enableFailoverToggle ? "已启用" : "未启用",
      detail: settings.enableFailoverToggle
        ? "可按应用配置候选线路"
        : "仅使用当前线路",
      active: Boolean(settings.enableFailoverToggle),
    },
  ];

  return (
    <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <SummaryCard key={item.label} {...item} />
      ))}
    </section>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
  active,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  active: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            active ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600",
          )}
        />
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">{label}</p>
      <strong className="mt-0.5 block text-sm">{value}</strong>
      <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}
