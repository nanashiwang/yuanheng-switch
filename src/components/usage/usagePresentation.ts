import {
  hasUsageTokens,
  isUnpricedUsage,
  type RequestLog,
} from "@/types/usage";

export function isCodexSessionImport(
  log: Pick<RequestLog, "providerId" | "dataSource">,
): boolean {
  return (
    log.providerId === "_codex_session" || log.dataSource === "codex_session"
  );
}

export function isOfficialAccountUsage(
  log: Pick<RequestLog, "providerId" | "appType">,
): boolean {
  // This is the actual upstream provider recorded by the proxy, not the
  // current configuration or a historical Codex model_provider alias.
  return log.appType === "codex" && log.providerId === "codex-official";
}

export function isUsageUnavailable(log: RequestLog): boolean {
  // Parsed upstream response IDs use the stable session: namespace. Preserve
  // explicit zero usage there; old fallback rows have random UUIDs and no usage.
  return (
    !hasUsageTokens(log) &&
    !log.requestId.startsWith("session:") &&
    !isCodexSessionImport(log)
  );
}

export function usageCostState(
  log: RequestLog,
): "account" | "unavailable" | "unpriced" | "priced" {
  if (isOfficialAccountUsage(log)) return "account";
  if (isUsageUnavailable(log)) return "unavailable";
  if (isUnpricedUsage(log)) return "unpriced";
  return "priced";
}
