import { useTranslation } from "react-i18next";
import { CalendarDays, Loader2, Zap } from "lucide-react";
import { useUsageSummary } from "@/lib/query/usage";
import { resolveUsageRange } from "@/lib/usageRange";
import type {
  UsageRangePreset,
  UsageRangeSelection,
  UsageScopeFilters,
} from "@/types/usage";
import { UsageDateRangePicker } from "./UsageDateRangePicker";
import { fmtCredits, fmtInt, getLocaleFromLanguage } from "./format";
import { cn } from "@/lib/utils";

const QUICK_RANGES: UsageRangePreset[] = ["today", "1d", "7d", "30d"];

export function UsageCostSummary({
  range,
  rangeLabel,
  filters,
  refreshIntervalMs,
  onRangeChange,
}: {
  range: UsageRangeSelection;
  rangeLabel: string;
  filters: UsageScopeFilters;
  refreshIntervalMs: number;
  onRangeChange: (range: UsageRangeSelection) => void;
}) {
  const { t, i18n } = useTranslation();
  const { data, isLoading, error } = useUsageSummary(range, filters, {
    refetchInterval: refreshIntervalMs > 0 ? refreshIntervalMs : false,
  });
  const locale = getLocaleFromLanguage(i18n.resolvedLanguage || i18n.language);
  const fallback = resolveUsageRange(range);
  const start = data?.periodStart ?? fallback.startDate;
  const end = data?.periodEnd ?? fallback.endDate;
  const date = (seconds: number) =>
    new Date(seconds * 1000).toLocaleString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  const coverageKnown =
    data?.pricedRequests != null && data?.unpricedRequests != null;

  return (
    <section
      aria-label={t("usage.periodSummary.title")}
      className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-5 md:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Zap className="h-4 w-4 text-primary" />
          {t("usage.periodSummary.title")}
        </h2>
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={t("usage.periodSummary.range")}
        >
          {QUICK_RANGES.map((preset) => (
            <button
              type="button"
              key={preset}
              aria-pressed={range.preset === preset}
              onClick={() => onRangeChange({ preset })}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs transition-colors",
                range.preset === preset
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/60 text-muted-foreground hover:bg-muted",
              )}
            >
              {t(`usage.periodSummary.${preset}`)}
            </button>
          ))}
          <UsageDateRangePicker
            triggerClassName="w-auto min-w-[136px] max-w-[220px]"
            selection={range}
            triggerLabel={
              range.preset === "custom" || range.preset === "14d"
                ? rangeLabel
                : t("usage.periodSummary.custom")
            }
            onApply={onRangeChange}
          />
        </div>
      </div>
      <div className="mt-5 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {t("usage.periodSummary.estimate")}
          </p>
          <div
            aria-live="polite"
            className="mt-2 break-all text-4xl font-semibold tracking-tight tabular-nums md:text-5xl"
          >
            {isLoading ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : error ? (
              "—"
            ) : (
              fmtCredits(data?.totalCost, 4, data?.costSymbol)
            )}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            {date(start)} — {date(end)}
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-5 text-sm sm:text-right">
          {[
            ["requests", data?.totalRequests],
            ["priced", data?.pricedRequests],
            ["unpriced", data?.unpricedRequests],
          ].map(([key, value]) => (
            <div key={String(key)}>
              <dt className="text-xs text-muted-foreground">
                {t(`usage.periodSummary.${key}`)}
              </dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {isLoading || error ? "—" : fmtInt(value, locale, "—")}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {error ? (
        <p role="alert" className="mt-4 text-xs text-destructive">
          {t("usage.periodSummary.loadFailed")}
        </p>
      ) : null}
      <p className="mt-4 border-t border-primary/10 pt-3 text-xs text-muted-foreground">
        {coverageKnown && data.unpricedRequests! > 0
          ? `${t("usage.periodSummary.partial", { count: data.unpricedRequests })} `
          : ""}
        {t("usage.periodSummary.help")}
      </p>
    </section>
  );
}
