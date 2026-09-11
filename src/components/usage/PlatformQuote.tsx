import { useTranslation } from "react-i18next";
import type { RequestLog } from "@/types/usage";
import { fmtCredits } from "./format";
import { isOfficialAccountUsage } from "./usagePresentation";

export function PlatformQuote({
  log,
  detail = false,
}: {
  log: RequestLog;
  detail?: boolean;
}) {
  const { t } = useTranslation();
  const quote = log.platformQuote;
  const available = quote?.amount != null;
  return (
    <div className="space-y-1" title={t("usage.platformPricing.help")}>
      <div className="font-medium tabular-nums">
        {available
          ? fmtCredits(quote.amount, detail ? 6 : 4, quote.symbol)
          : t(
              `usage.platformPricing.reason.${quote?.reason ?? "pricing_missing"}`,
            )}
      </div>
      {isOfficialAccountUsage(log) && (
        <div
          className="text-xs text-muted-foreground"
          title={t("usage.accountBillingHelp")}
        >
          {t("usage.accountBilling")}
        </div>
      )}
      {quote?.group && (
        <div className="text-xs text-muted-foreground">
          {quote.group} · ×{quote.groupRatio}
        </div>
      )}
      {detail && (
        <>
          <p className="text-xs text-muted-foreground">
            {t("usage.platformPricing.help")}
          </p>
          {quote?.quotedAt && (
            <p className="text-xs text-muted-foreground">
              {t("usage.platformPricing.quoteDate", {
                time: new Date(quote.quotedAt * 1000).toLocaleString(),
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
