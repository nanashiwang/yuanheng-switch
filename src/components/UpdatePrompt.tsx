import {
  AlertCircle,
  ArrowRight,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Rocket,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdate } from "@/contexts/UpdateContext";
import { settingsApi } from "@/lib/api";

const RELEASES_URL = "https://github.com/nanashiwang/yuanheng-switch/releases";

function formatMegabytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

export function UpdatePrompt() {
  const { t } = useTranslation();
  const {
    updateInfo,
    isPromptOpen,
    isPortable,
    isUpdating,
    phase,
    progress,
    error,
    startUpdate,
    remindLater,
    ignoreUpdate,
  } = useUpdate();

  if (!updateInfo) return null;

  const percent =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  const openReleaseNotes = async () => {
    const version = updateInfo.availableVersion.startsWith("v")
      ? updateInfo.availableVersion
      : `v${updateInfo.availableVersion}`;
    try {
      await settingsApi.openExternal(
        `${RELEASES_URL}/tag/${encodeURIComponent(version)}`,
      );
    } catch {
      await settingsApi.openExternal(RELEASES_URL);
    }
  };

  return (
    <Dialog
      open={isPromptOpen}
      onOpenChange={(open) => {
        if (!open && !isUpdating) remindLater();
      }}
    >
      <DialogContent
        className="max-w-[460px] overflow-hidden p-0"
        zIndex="top"
        onEscapeKeyDown={(event) => {
          if (isUpdating) event.preventDefault();
        }}
      >
        <DialogHeader className="relative overflow-hidden border-b-0 bg-[#123b35] px-6 py-6 text-white">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#e9b67c] text-[#163a36]">
              <Rocket className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-white">
                {t("settings.updatePromptTitle")}
              </DialogTitle>
              <DialogDescription className="mt-1 text-white/65">
                {t("settings.updatePromptDescription")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="flex items-center justify-center gap-3 rounded-lg border bg-muted/35 px-4 py-3 font-mono text-sm tabular-nums">
            <span className="text-muted-foreground">
              v{updateInfo.currentVersion || "-"}
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-emerald-600">
              v{updateInfo.availableVersion}
            </span>
          </div>

          {updateInfo.notes && (
            <div className="max-h-36 overflow-y-auto rounded-lg border px-4 py-3">
              <p className="mb-1.5 text-xs font-semibold">
                {t("settings.releaseNotes")}
              </p>
              <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                {updateInfo.notes}
              </p>
            </div>
          )}

          {isUpdating && (
            <div className="space-y-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                  {phase === "installing"
                    ? t("settings.installingUpdate")
                    : t("settings.downloadingUpdate")}
                </span>
                {percent !== null && (
                  <span className="tabular-nums text-muted-foreground">
                    {percent}%
                  </span>
                )}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={
                    percent === null
                      ? "h-full w-1/3 animate-pulse rounded-full bg-emerald-500"
                      : "h-full rounded-full bg-emerald-500 transition-[width] duration-200"
                  }
                  style={
                    percent === null ? undefined : { width: `${percent}%` }
                  }
                />
              </div>
              {progress && (
                <p className="text-right text-[10px] tabular-nums text-muted-foreground">
                  {formatMegabytes(progress.downloaded)} MB
                  {progress.total
                    ? ` / ${formatMegabytes(progress.total)} MB`
                    : ""}
                </p>
              )}
            </div>
          )}

          {phase === "error" && error && (
            <div className="flex gap-2 rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2.5 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="break-words">{error}</span>
            </div>
          )}

          {!isUpdating && (
            <p className="text-[11px] leading-5 text-muted-foreground">
              {isPortable
                ? t("settings.portableUpdateHint")
                : t("settings.updateRestartHint")}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 px-6 py-4">
          {!isUpdating && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void openReleaseNotes()}
                className="mr-auto gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("settings.releaseNotes")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={ignoreUpdate}
              >
                {t("settings.ignoreThisVersion")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={remindLater}
              >
                {t("settings.remindLater")}
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5 bg-[#123b35] text-white hover:bg-[#1b5149]"
                onClick={() => void startUpdate().catch(() => undefined)}
              >
                {phase === "error" ? (
                  <RefreshCw className="h-3.5 w-3.5" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {phase === "error"
                  ? t("settings.retryUpdate")
                  : isPortable
                    ? t("settings.openDownloadPage")
                    : t("settings.updateNow")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
