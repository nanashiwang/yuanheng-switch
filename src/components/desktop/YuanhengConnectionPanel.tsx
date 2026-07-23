import { useState } from "react";
import {
  CheckCircle2,
  Cloud,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { YuanhengAuthResult, YuanhengToolId } from "@/lib/api/yuanheng";
import { APP_ICON_MAP } from "@/config/appConfig";
import {
  useDisconnectYuanheng,
  useLoginYuanheng,
  useRefreshYuanheng,
  useRegisterYuanheng,
  useVerifyYuanhengTwoFactor,
  useYuanhengConnection,
} from "@/lib/query/yuanheng";

const toolLabel = (app: YuanhengToolId) => {
  if (app === "chatgpt-desktop") return "ChatGPT Desktop";
  if (app === "workbuddy") return "WorkBuddy";
  return APP_ICON_MAP[app].label;
};
import { extractErrorMessage } from "@/utils/errorUtils";
import { cn } from "@/lib/utils";

interface YuanhengConnectionPanelProps {
  compact?: boolean;
  onConnected?: () => void;
}

export function YuanhengConnectionPanel({
  compact = false,
  onConnected,
}: YuanhengConnectionPanelProps) {
  const { data: status, isLoading } = useYuanhengConnection();
  const login = useLoginYuanheng();
  const register = useRegisterYuanheng();
  const verifyTwoFactor = useVerifyYuanhengTwoFactor();
  const refresh = useRefreshYuanheng();
  const disconnect = useDisconnectYuanheng();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");

  const finishAuthentication = (result: YuanhengAuthResult) => {
    setPassword("");
    setConfirmPassword("");
    if (result.requiresTwoFactor) {
      setRequiresTwoFactor(true);
      toast.success("账号密码验证通过，请完成两步验证");
      return;
    }
    setUsername("");
    setTwoFactorCode("");
    setRequiresTwoFactor(false);
    toast.success(authMode === "register" ? "注册并登录成功" : "登录成功");
    onConnected?.();
  };

  const handleAuthenticate = async () => {
    const normalizedUsername = username.trim();
    if (!normalizedUsername || normalizedUsername.length > 20) {
      toast.error("用户名不能为空且不能超过 20 个字符");
      return;
    }
    if (password.length < 8 || password.length > 20) {
      toast.error("密码长度必须为 8 到 20 个字符");
      return;
    }
    if (authMode === "register" && password !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }
    try {
      const result = await (
        authMode === "register" ? register : login
      ).mutateAsync({
        username: normalizedUsername,
        password,
      });
      finishAuthentication(result);
    } catch (error) {
      toast.error(
        extractErrorMessage(error) ||
          (authMode === "register" ? "注册失败" : "登录失败"),
      );
    }
  };

  const handleTwoFactor = async () => {
    if (!twoFactorCode.trim()) {
      toast.error("请输入两步验证码或备用码");
      return;
    }
    try {
      const result = await verifyTwoFactor.mutateAsync(twoFactorCode.trim());
      finishAuthentication(result);
    } catch (error) {
      toast.error(extractErrorMessage(error) || "两步验证失败");
    }
  };

  const switchAuthMode = (mode: "login" | "register") => {
    setAuthMode(mode);
    setPassword("");
    setConfirmPassword("");
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
      const result = await disconnect.mutateAsync();
      if (result.retainedTools.length > 0) {
        const tools = result.retainedTools.map(toolLabel).join("、");
        toast.warning(`账号已断开；${tools} 缺少原配置，元衡配置仍保留`);
      } else if (
        result.restoredTools.length > 0 ||
        result.removedTools.length > 0
      ) {
        toast.success("已断开元衡账号，并恢复工具原配置");
      } else {
        toast.success("已断开元衡账号");
      }
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
    const authPending = login.isPending || register.isPending;
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
              {requiresTwoFactor ? "完成两步验证" : "登录你的元衡账号"}
            </h2>
            <p className="mt-2 max-w-lg text-[13px] leading-5 text-muted-foreground">
              {requiresTwoFactor
                ? "输入认证器验证码或备用码，验证成功后即可继续。"
                : "直接使用账号密码登录或注册。密码不会保存在本机，登录后客户端会自动创建或复用本机专用工具凭据。"}
            </p>
            {!requiresTwoFactor && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-3 w-3" /> 账号密码仅用于本次认证
              </p>
            )}
          </div>
          <div className="relative rounded-xl border bg-background/80 p-4 shadow-sm">
            {requiresTwoFactor ? (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleTwoFactor();
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="yuanheng-two-factor" className="text-[12px]">
                    两步验证码
                  </Label>
                  <Input
                    id="yuanheng-two-factor"
                    autoFocus
                    autoComplete="one-time-code"
                    value={twoFactorCode}
                    onChange={(event) => setTwoFactorCode(event.target.value)}
                    placeholder="6 位验证码或备用码"
                    className="h-9"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!twoFactorCode.trim() || verifyTwoFactor.isPending}
                >
                  {verifyTwoFactor.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  验证并登录
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-[12px]"
                  disabled={verifyTwoFactor.isPending}
                  onClick={() => {
                    setRequiresTwoFactor(false);
                    setTwoFactorCode("");
                  }}
                >
                  返回账号登录
                </Button>
              </form>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleAuthenticate();
                }}
              >
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/65 p-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={authMode === "login" ? "secondary" : "ghost"}
                    className="h-8 text-[12px]"
                    aria-pressed={authMode === "login"}
                    onClick={() => switchAuthMode("login")}
                  >
                    登录
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={authMode === "register" ? "secondary" : "ghost"}
                    className="h-8 text-[12px]"
                    aria-pressed={authMode === "register"}
                    onClick={() => switchAuthMode("register")}
                  >
                    注册
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="yuanheng-username" className="text-[12px]">
                    用户名
                  </Label>
                  <Input
                    id="yuanheng-username"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="输入元衡用户名"
                    maxLength={20}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="yuanheng-password" className="text-[12px]">
                    密码
                  </Label>
                  <Input
                    id="yuanheng-password"
                    type="password"
                    autoComplete={
                      authMode === "register"
                        ? "new-password"
                        : "current-password"
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="8 到 20 个字符"
                    className="h-9"
                  />
                </div>
                {authMode === "register" && (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="yuanheng-confirm-password"
                      className="text-[12px]"
                    >
                      确认密码
                    </Label>
                    <Input
                      id="yuanheng-confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      placeholder="再次输入密码"
                      className="h-9"
                    />
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!username.trim() || !password || authPending}
                >
                  {authPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : authMode === "register" ? (
                    <UserPlus className="h-4 w-4" />
                  ) : (
                    <LogIn className="h-4 w-4" />
                  )}
                  {authMode === "register" ? "注册并登录" : "登录"}
                </Button>
              </form>
            )}
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
            元衡账号已登录 · 本机工具凭据已就绪
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
            退出登录
          </Button>
        )}
      </div>
    </section>
  );
}
