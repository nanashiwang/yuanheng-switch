import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DeepLinkImportRequest } from "../../lib/api/deeplink";
import { decodeBase64Utf8 } from "../../lib/utils/base64";
import {
  classifyCommand,
  classifyEndpoint,
  classifyEnvKey,
  maskValue,
  riskI18nKey,
  type RiskKind,
} from "../../utils/deeplinkRisk";

const riskClassName =
  "inline-flex items-center rounded-md bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";

export function McpConfirmation({
  request,
}: {
  request: DeepLinkImportRequest;
}) {
  const { t } = useTranslation();

  const mcpServers = useMemo(() => {
    if (!request.config) return {};
    try {
      const parsed = JSON.parse(decodeBase64Utf8(request.config));
      const servers = parsed?.mcpServers;
      return servers && typeof servers === "object" && !Array.isArray(servers)
        ? (servers as Record<string, Record<string, unknown>>)
        : {};
    } catch (e) {
      console.error("Failed to parse MCP config:", e);
      return {};
    }
  }, [request.config]);

  const targetApps = request.apps?.split(",").map((app) => app.trim()).filter(Boolean) || [];
  const serverCount = Object.keys(mcpServers).length;

  const getRisks = (spec: Record<string, unknown>): RiskKind[] => {
    const risks = [
      classifyCommand(spec.command, spec.args),
      classifyEndpoint(spec.url),
      ...(spec.env && typeof spec.env === "object" && !Array.isArray(spec.env)
        ? Object.keys(spec.env as Record<string, unknown>).map(classifyEnvKey)
        : []),
    ];
    return [...new Set(risks.filter((risk): risk is RiskKind => risk !== null))];
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{t("deeplink.mcp.title")}</h3>

      <div>
        <label className="block text-sm font-medium text-muted-foreground">
          {t("deeplink.mcp.targetApps")}
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          {targetApps.map((app) => (
            <span
              key={app}
              className="rounded bg-primary/10 px-2 py-1 text-xs capitalize text-primary"
            >
              {app}
            </span>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-muted-foreground">
          {t("deeplink.mcp.serverCount", { count: serverCount })}
        </label>
        <div className="mt-1 max-h-96 space-y-2 overflow-auto rounded border bg-muted/30 p-2">
          {Object.entries(mcpServers).map(([id, rawSpec]) => {
            const spec = rawSpec && typeof rawSpec === "object" ? rawSpec : {};
            const risks = getRisks(spec);
            const args = Array.isArray(spec.args)
              ? spec.args.filter((arg): arg is string => typeof arg === "string")
              : [];
            const env =
              spec.env && typeof spec.env === "object" && !Array.isArray(spec.env)
                ? (spec.env as Record<string, unknown>)
                : {};

            return (
              <div key={id} className="rounded border bg-background p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold text-sm">{id}</div>
                  {risks.map((risk) => (
                    <span className={riskClassName} key={risk}>
                      {t(riskI18nKey(risk))}
                    </span>
                  ))}
                </div>

                {typeof spec.command === "string" && (
                  <div className="mt-2 text-xs">
                    <div className="font-medium text-muted-foreground">{t("deeplink.mcp.command")}</div>
                    <code className="mt-1 block break-all whitespace-pre-wrap rounded bg-muted/50 p-1">
                      {[spec.command, ...args].join(" ")}
                    </code>
                  </div>
                )}

                {typeof spec.url === "string" && (
                  <div className="mt-2 text-xs">
                    <div className="font-medium text-muted-foreground">{t("deeplink.mcp.endpoint")}</div>
                    <code className="mt-1 block break-all rounded bg-muted/50 p-1">{spec.url}</code>
                  </div>
                )}

                {Object.keys(env).length > 0 && (
                  <div className="mt-2 text-xs">
                    <div className="font-medium text-muted-foreground">{t("deeplink.mcp.environment")}</div>
                    <div className="mt-1 space-y-1 rounded bg-muted/50 p-1 font-mono">
                      {Object.entries(env).map(([key, value]) => (
                        <div className="break-all" key={key}>
                          {key}={maskValue(key, String(value))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {typeof spec.enabled === "boolean" && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {t("deeplink.mcp.enabledState")}: {spec.enabled ? t("deeplink.mcp.enabled") : t("deeplink.mcp.disabled")}
                  </div>
                )}
              </div>
            );
          })}
          {serverCount === 0 && (
            <div className="p-2 text-sm text-muted-foreground">{t("deeplink.mcp.noServers")}</div>
          )}
        </div>
      </div>

      <div className="text-sm text-muted-foreground">{t("deeplink.mcp.reviewHint")}</div>

      {request.enabled && (
        <div className="flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-500">
          <span>⚠️</span>
          <span>{t("deeplink.mcp.enabledWarning")}</span>
        </div>
      )}
    </div>
  );
}
