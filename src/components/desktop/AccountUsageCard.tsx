import { ArrowRight, Wallet } from "lucide-react";
import { useYuanhengConnection } from "@/lib/query/yuanheng";

interface AccountUsageCardProps {
  onOpenUsage: () => void;
}

export function AccountUsageCard({ onOpenUsage }: AccountUsageCardProps) {
  const { data: connection } = useYuanhengConnection();
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
        <h2 className="text-[13px] font-semibold">账号用量</h2>
        <button
          type="button"
          onClick={onOpenUsage}
          className="ml-auto inline-flex items-center gap-0.5 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          会话与用量
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
      <p className="font-display text-[26px] font-semibold tabular-nums">
        ${account.remainingUsd.toFixed(2)}
      </p>
      <p className="mt-0.5 text-[10.5px] text-muted-foreground">
        剩余额度 · 已用 ${account.usedUsd.toFixed(2)}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400"
          style={{ width: `${progressWidth}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>已用 {usedPercent}%</span>
        <span>${total.toFixed(2)} 总额</span>
      </div>
    </section>
  );
}
