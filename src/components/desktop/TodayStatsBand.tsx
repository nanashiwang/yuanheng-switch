import { useTranslation } from "react-i18next";
import { Coins, Database, DatabaseBackup, Zap } from "lucide-react";
import { useUsageSummary } from "@/lib/query/usage";
import {
  fmtInt,
  fmtUsd,
  formatTokensShort,
  getResolvedLang,
} from "@/components/usage/format";
import { dt } from "./desktopI18n";

/**
 * 今日速览统计带：请求 / Tokens / 成本 / 缓存命中率。
 * 数据与「会话与用量」页同源（useUsageSummary）。
 */
export function TodayStatsBand() {
  const { i18n } = useTranslation();
  const lang = getResolvedLang(i18n);
  const { data: summary } = useUsageSummary({ preset: "today" }, undefined, {
    refetchInterval: 60_000,
  });

  const cells = [
    {
      icon: Zap,
      iconClass: "bg-emerald-500/10 text-emerald-600",
      value: summary ? fmtInt(summary.totalRequests, lang) : "--",
      label: dt("今日请求"),
    },
    {
      icon: Database,
      iconClass: "bg-sky-500/10 text-sky-600",
      value: summary ? formatTokensShort(summary.realTotalTokens, lang) : "--",
      label: dt("今日 Tokens"),
    },
    {
      icon: Coins,
      iconClass: "bg-amber-500/10 text-amber-600",
      value: summary ? fmtUsd(summary.totalCost, 2) : "--",
      label: dt("今日成本"),
    },
    {
      icon: DatabaseBackup,
      iconClass: "bg-violet-500/10 text-violet-600",
      value: summary ? `${Math.round(summary.cacheHitRate * 100)}%` : "--",
      label: dt("缓存命中率"),
    },
  ];

  return (
    <section className="grid grid-cols-2 rounded-2xl border bg-card shadow-sm sm:grid-cols-4">
      {cells.map((cell, index) => (
        <div
          key={cell.label}
          className={
            "flex items-center gap-3 px-[18px] py-3.5 " +
            (index > 0 ? "border-l border-border/60 " : "") +
            (index >= 2 ? "max-sm:border-t max-sm:border-border/60 " : "") +
            (index === 2 ? "max-sm:border-l-0" : "")
          }
        >
          <span
            className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] ${cell.iconClass}`}
          >
            <cell.icon className="h-[15px] w-[15px]" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-[19px] font-semibold leading-tight tabular-nums">
              {cell.value}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {cell.label}
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}
