import type { ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  Bot,
  CircleDollarSign,
  Coins,
  Database,
  Gauge,
  Network,
  Route,
  Settings,
  WalletCards,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppId } from "@/lib/api";
import type { YuanhengConnectionStatus } from "@/lib/api/yuanheng";
import { APP_ICON_MAP } from "@/config/appConfig";
import { ProviderIcon } from "@/components/ProviderIcon";
import { useProxyStatus } from "@/hooks/useProxyStatus";
import { useUsageSummary } from "@/lib/query/usage";
import {
  fmtInt,
  fmtUsd,
  formatTokensShort,
  getResolvedLang,
} from "@/components/usage/format";
import { cn } from "@/lib/utils";
import type { DesktopView } from "./types";

interface DesktopContextPanelProps {
  activeApp: AppId;
  connection?: YuanhengConnectionStatus;
  onNavigate: (view: DesktopView) => void;
  className?: string;
  footer?: ReactNode;
}

function appProviderIcon(app: AppId): string {
  if (app === "codex") return "openai";
  if (app === "claude-desktop") return "claude";
  return app;
}

export function DesktopContextPanel({
  activeApp,
  connection,
  onNavigate,
  className,
  footer,
}: DesktopContextPanelProps) {
  const { i18n } = useTranslation();
  const lang = getResolvedLang(i18n);
  const { data: summary } = useUsageSummary({ preset: "today" }, undefined, {
    refetchInterval: 60_000,
  });
  const { status, isRunning, isTakeoverActive } = useProxyStatus();
  const balance = connection?.account?.remainingUsd;

  const stats = [
    {
      label: "请求数",
      value: summary ? `${fmtInt(summary.totalRequests, lang)} 次` : "--",
      icon: Activity,
    },
    {
      label: "Token 总量",
      value: summary
        ? `${formatTokensShort(summary.realTotalTokens, lang)} Tokens`
        : "--",
      icon: Database,
    },
    {
      label: "估算成本",
      value: summary ? `约 ${fmtUsd(summary.totalCost, 2)}` : "--",
      icon: Coins,
    },
    {
      label: "缓存率",
      value: summary ? `${Math.round(summary.cacheHitRate * 100)}% 命中` : "--",
      icon: Gauge,
    },
  ];

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-[272px] shrink-0 flex-col border-l bg-background/78 backdrop-blur-xl",
        className,
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Context
            </p>
            <h2 className="mt-0.5 font-display text-sm font-semibold">
              当前状态
            </h2>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-semibold",
              connection?.connected
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-muted text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                connection?.connected ? "bg-emerald-500" : "bg-slate-400",
              )}
            />
            {connection?.connected ? "在线" : "离线"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onNavigate("tools")}
          className="group w-full rounded-2xl border bg-[linear-gradient(145deg,hsl(var(--card)),hsl(var(--muted)/0.35))] p-4 text-left shadow-sm transition-colors hover:border-primary/30"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border/70">
              <ProviderIcon
                icon={appProviderIcon(activeApp)}
                name={APP_ICON_MAP[activeApp].label}
                size={20}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] text-muted-foreground">
                焦点应用
              </span>
              <strong className="mt-0.5 block truncate text-sm">
                {APP_ICON_MAP[activeApp].label}
              </strong>
            </span>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </div>
        </button>

        <section className="mt-3 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <WalletCards className="h-3.5 w-3.5" /> 可用余额
            </span>
            <button
              type="button"
              onClick={() => onNavigate("usage")}
              className="text-[9px] font-medium text-primary hover:underline"
            >
              查看用量
            </button>
          </div>
          <p className="mt-2 font-display text-2xl font-semibold tabular-nums">
            {balance == null ? "--" : `余额 $${balance.toFixed(2)}`}
          </p>
        </section>

        <section className="mt-3 overflow-hidden rounded-2xl border bg-card shadow-sm">
          <header className="flex items-center gap-2 border-b px-4 py-3 text-[11px] font-semibold">
            <CircleDollarSign className="h-4 w-4 text-primary" /> 今日速览
          </header>
          <div className="grid grid-cols-2">
            {stats.map(({ label, value, icon: Icon }, index) => (
              <button
                key={label}
                type="button"
                onClick={() => onNavigate("usage")}
                className={cn(
                  "px-3.5 py-3 text-left transition-colors hover:bg-muted/45",
                  index % 2 === 1 && "border-l",
                  index > 1 && "border-t",
                )}
              >
                <Icon className="mb-2 h-3.5 w-3.5 text-muted-foreground" />
                <strong className="block truncate text-sm tabular-nums">
                  {value}
                </strong>
                <span className="mt-0.5 block text-[9px] text-muted-foreground">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-3 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold">连接状态</h3>
            <button
              type="button"
              onClick={() => onNavigate("network")}
              className="text-[9px] text-primary hover:underline"
            >
              管理
            </button>
          </div>
          <div className="mt-3 space-y-3">
            <StatusRow
              icon={Network}
              label="元衡服务"
              value={connection?.connected ? "已连接" : "未连接"}
              active={Boolean(connection?.connected)}
            />
            <StatusRow
              icon={Route}
              label="本地路由"
              value={
                isRunning
                  ? status?.port
                    ? `运行中 · ${status.port}`
                    : "运行中"
                  : "未启动"
              }
              active={isRunning}
            />
            <StatusRow
              icon={Bot}
              label="应用接管"
              value={isTakeoverActive ? "已启用" : "未启用"}
              active={Boolean(isTakeoverActive)}
            />
          </div>
        </section>

        <section className="mt-3 grid grid-cols-2 gap-2">
          <QuickLink
            icon={Activity}
            label="用量"
            onClick={() => onNavigate("usage")}
          />
          <QuickLink
            icon={Settings}
            label="设置"
            onClick={() => onNavigate("settings")}
          />
        </section>
      </div>
      {footer}
    </aside>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
  active,
}: {
  icon: typeof Network;
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[9px] text-muted-foreground">{label}</span>
        <span className="block truncate text-[10px] font-medium">{value}</span>
      </span>
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          active ? "bg-emerald-500" : "bg-slate-400/60",
        )}
      />
    </div>
  );
}

function QuickLink({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Settings;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between rounded-xl border bg-card px-3 py-2.5 text-[10px] font-medium transition-colors hover:border-primary/30 hover:bg-muted/30"
    >
      <span className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {label}
      </span>
      <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}
