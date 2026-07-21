import { CheckCircle2, Cloud, ExternalLink, Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Provider } from "@/types";
import type { AppId } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const YUANHENG_CONSOLE_URL = "https://cn.meta-api.vip/console/token";
const YUANHENG_API_HOST = "cn.meta-api.vip";

export function isYuanhengProvider(provider?: Provider): boolean {
  if (!provider) return false;

  return JSON.stringify(provider).toLowerCase().includes(YUANHENG_API_HOST);
}

interface YuanhengProjectBannerProps {
  activeApp: AppId;
  currentProvider?: Provider;
}

export function YuanhengProjectBanner({
  activeApp,
  currentProvider,
}: YuanhengProjectBannerProps) {
  const { t } = useTranslation();
  const isConnected = isYuanhengProvider(currentProvider);
  const appName = t(`apps.${activeApp}`);

  return (
    <section
      className={cn(
        "relative mt-4 overflow-hidden rounded-2xl border px-5 py-4",
        isConnected
          ? "border-emerald-500/25 bg-emerald-500/[0.06]"
          : "border-sky-500/20 bg-gradient-to-r from-sky-500/[0.08] via-background to-amber-500/[0.08]",
      )}
    >
      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-sky-400/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              isConnected
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-sky-500/15 text-sky-600 dark:text-sky-400",
            )}
          >
            {isConnected ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Link2 className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t("yuanhengPlatform.eyebrow")}
              </span>
              {isConnected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  <Cloud className="h-3 w-3" />
                  {t("yuanhengPlatform.connected")}
                </span>
              )}
            </div>
            <h2 className="mt-1 text-base font-semibold text-foreground">
              {t(
                isConnected
                  ? "yuanhengPlatform.connectedTitle"
                  : "yuanhengPlatform.readyTitle",
                { appName },
              )}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t(
                isConnected
                  ? "yuanhengPlatform.connectedDescription"
                  : "yuanhengPlatform.readyDescription",
              )}
            </p>
            {currentProvider && (
              <p className="mt-1 truncate text-xs text-muted-foreground/80">
                {t(
                  isConnected
                    ? "yuanhengPlatform.activeConnection"
                    : "yuanhengPlatform.localConnection",
                  { name: currentProvider.name },
                )}
              </p>
            )}
          </div>
        </div>

        <Button variant={isConnected ? "outline" : "default"} size="sm" asChild>
          <a href={YUANHENG_CONSOLE_URL} target="_blank" rel="noreferrer">
            {t("yuanhengPlatform.openConsole")}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>
    </section>
  );
}
