import { useState } from "react";
import {
  CheckCircle2,
  Cloud,
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { settingsApi } from "@/lib/api";
import {
  useConnectYuanheng,
  useDisconnectYuanheng,
  useRefreshYuanheng,
  useYuanhengConnection,
} from "@/lib/query/yuanheng";
import { extractErrorMessage } from "@/utils/errorUtils";
import { cn } from "@/lib/utils";

interface YuanhengConnectionPanelProps {
  compact?: boolean;
  onConnected?: () => void;
}

const formatUsd = (value?: number) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value ?? 0);

export function YuanhengConnectionPanel({
  compact = false,
  onConnected,
}: YuanhengConnectionPanelProps) {
  const { data: status, isLoading } = useYuanhengConnection();
  const connect = useConnectYuanheng();
  const refresh = useRefreshYuanheng();
  const disconnect = useDisconnectYuanheng();
  const [accessToken, setAccessToken] = useState("");
  const [userId, setUserId] = useState("");

  const handleConnect = async () => {
    try {
      await connect.mutateAsync({ accessToken, userId });
      setAccessToken("");
      toast.success("元衡账号已连接");
      onConnected?.();
    } catch (error) {
      toast.error(extractErrorMessage(error) || "连接失败，请检查设备凭据");
    }
  };

  const handleRefresh = async () => {
    try {
      await refresh.mutateAsync();
      toast.success("元衡数据已同步");
    } catch (error) {
      toast.error(extractErrorMessage(error) || "同步失败");
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect.mutateAsync();
      toast.success("已断开元衡账号");
    } catch (error) {
      toast.error(extractErrorMessage(error) || "断开失败");
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-36 items-center justify-center rounded-2xl border bg-card">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-card to-[#d69554]/[0.08] p-5">
        <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div
          className={cn(
            "relative",
            compact ? "space-y-4" : "grid gap-6 md:grid-cols-[1fr_1.05fr]",
          )}
        >
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Cloud className="h-5 w-5" />
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              元衡 API
            </p>
            <h2 className="font-display mt-1 text-xl font-semibold">
              连接你的元衡账号
            </h2>
            <p className="mt-2 max-w-lg text-[13px] leading-5 text-muted-foreground">
              桌面端只保存设备凭据并同步项目权限，不需要逐个维护 API 地址或
              Key。访问令牌可在元衡控制台创建。
            </p>
            <Button
              variant="link"
              className="mt-2 h-auto px-0 text-[12px]"
              onClick={() =>
                void settingsApi.openExternal(
                  "https://cn.meta-api.vip/console/token",
                )
              }
            >
              打开令牌控制台 <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="relative rounded-xl border bg-background/80 p-4 shadow-sm">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="yuanheng-user-id" className="text-[12px]">
                  用户 ID
                </Label>
                <Input
                  id="yuanheng-user-id"
                  inputMode="numeric"
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                  placeholder="例如 1024"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="yuanheng-access-token" className="text-[12px]">
                  访问令牌
                </Label>
                <Input
                  id="yuanheng-access-token"
                  type="password"
                  value={accessToken}
                  onChange={(event) => setAccessToken(event.target.value)}
                  placeholder="粘贴元衡访问令牌"
                  className="h-9"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleConnect();
                  }}
                />
              </div>
              <Button
                className="w-full"
                disabled={
                  !accessToken.trim() || !userId.trim() || connect.isPending
                }
                onClick={() => void handleConnect()}
              >
                {connect.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                验证并连接
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const accountName =
    status.account?.displayName ||
    status.account?.username ||
    `用户 ${status.userId}`;
  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-card">
      <div className="flex flex-wrap items-center gap-4 border-b border-border/70 bg-emerald-500/[0.055] px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display truncate text-base font-semibold">
              {accountName}
            </h2>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              {status.account?.group || "default"}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            元衡已连接 · 用户 ID {status.userId}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleRefresh()}
          disabled={refresh.isPending}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", refresh.isPending && "animate-spin")}
          />
          同步
        </Button>
        {!compact && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleDisconnect()}
            disabled={disconnect.isPending}
          >
            <LogOut className="h-3.5 w-3.5" />
            断开
          </Button>
        )}
      </div>
      <div
        className={cn(
          "grid gap-px bg-border/60",
          compact ? "grid-cols-2" : "grid-cols-3",
        )}
      >
        <div className="bg-card px-5 py-4">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <WalletCards className="h-3.5 w-3.5" /> 可用余额
          </div>
          <p className="mt-1 font-display text-xl font-semibold">
            {formatUsd(status.account?.remainingUsd)}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            已用 {formatUsd(status.account?.usedUsd)}
          </p>
        </div>
        <div className="bg-card px-5 py-4">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> 可用模型
          </div>
          <p className="mt-1 font-display text-xl font-semibold">
            {status.models.length}
          </p>
        </div>
        {!compact && (
          <div className="bg-card px-5 py-4">
            <div className="text-[11px] text-muted-foreground">API 入口</div>
            <p className="mt-1 truncate font-mono text-[12px] font-medium">
              {status.baseUrl}
            </p>
          </div>
        )}
      </div>
      {!compact && status.models.length > 0 && (
        <div className="border-t px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold">账号可用模型</p>
            <span className="text-[10px] text-muted-foreground">
              {status.lastSyncedAt
                ? `${new Date(status.lastSyncedAt * 1000).toLocaleString("zh-CN")} 同步`
                : "已同步"}
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {status.models.slice(0, 12).map((model) => (
              <span
                key={model}
                className="max-w-full truncate rounded-md bg-muted/70 px-2 py-1 font-mono text-[10px] text-muted-foreground"
                title={model}
              >
                {model}
              </span>
            ))}
            {status.models.length > 12 && (
              <span className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
                +{status.models.length - 12}
              </span>
            )}
          </div>
        </div>
      )}
      {status.announcement && !compact && (
        <p className="border-t px-5 py-3 text-[12px] leading-5 text-muted-foreground">
          {status.announcement}
        </p>
      )}
    </section>
  );
}
