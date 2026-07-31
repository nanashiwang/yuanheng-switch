import { ArrowRight, CreditCard, LoaderCircle, Wallet } from "lucide-react";
import { useYuanhengTopup } from "@/hooks/useYuanhengTopup";
import { useYuanhengConnection } from "@/lib/query/yuanheng";
import { dt } from "./desktopI18n";

interface AccountUsageCardProps {
  onOpenUsage: () => void;
}

export function AccountUsageCard({ onOpenUsage }: AccountUsageCardProps) {
  const { data: connection } = useYuanhengConnection();
  const { isOpening, openTopup } = useYuanhengTopup();
  const account = connection?.account;
  if (!connection?.connected || !account) return null;

  const total = account.remainingUsd + account.usedUsd;
  const usedPercent =
    total > 0 ? Math.min(100, Math.round((account.usedUsd / total) * 100)) : 0;
  const progressWidth = usedPercent > 0 ? Math.max(usedPercent, 2) : 0;

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <h2 className="text-[13px] font-semibold">{dt("账号用量")}</h2>
        <button
          type="button"
          onClick={onOpenUsage}
          className="ml-auto inline-flex items-center gap-0.5 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {dt("会话与用量")}
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-[26px] font-semibold tabular-nums">
            ${account.remainingUsd.toFixed(2)}
          </p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            {dt("剩余额度 · 已用 {{amount}}", {
              amount: `$${account.usedUsd.toFixed(2)}`,
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void openTopup()}
          disabled={isOpening}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
        >
          {isOpening ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CreditCard className="h-3.5 w-3.5" />
          )}
          {isOpening ? dt("打开中") : dt("充值")}
        </button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400"
          style={{ width: `${progressWidth}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>{dt("已用 {{percent}}%", { percent: usedPercent })}</span>
        <span>{dt("{{amount}} 总额", { amount: `$${total.toFixed(2)}` })}</span>
      </div>
    </section>
  );
}
