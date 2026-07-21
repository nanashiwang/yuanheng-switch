import { Download, ExternalLink, Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { AppId } from "@/lib/api/types";

interface ProviderEmptyStateProps {
  appId: AppId;
  onImport?: () => void;
}

export function ProviderEmptyState({
  appId,
  onImport,
}: ProviderEmptyStateProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-10 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Link2 className="h-7 w-7 text-sky-500" />
      </div>
      <h3 className="text-lg font-semibold">
        {t("yuanhengPlatform.readyTitle", { appName: t(`apps.${appId}`) })}
      </h3>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">
        {t("yuanhengPlatform.readyDescription")}
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <a
            href="https://cn.meta-api.vip/console/token"
            target="_blank"
            rel="noreferrer"
          >
            {t("yuanhengPlatform.openConsole")}
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
        {onImport && (
          <Button variant="outline" onClick={onImport}>
            <Download className="mr-2 h-4 w-4" />
            {appId === "claude-desktop"
              ? t("provider.importFromClaude", {
                  defaultValue: "将 Claude Code 中已有的供应商导入",
                })
              : t("provider.importCurrent")}
          </Button>
        )}
      </div>
    </div>
  );
}
