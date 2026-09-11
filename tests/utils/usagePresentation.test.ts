import { describe, expect, it } from "vitest";
import {
  isCodexSessionImport,
  isUsageUnavailable,
  usageCostState,
} from "@/components/usage/usagePresentation";
import type { RequestLog } from "@/types/usage";

export function log(overrides: Partial<RequestLog> = {}): RequestLog {
  return {
    requestId: "fallback-request-uuid",
    providerId: "codex-official",
    providerName: "OpenAI Official",
    appType: "codex",
    model: "gpt-6-astra",
    costMultiplier: "1",
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    inputCostUsd: "0",
    outputCostUsd: "0",
    cacheReadCostUsd: "0",
    cacheCreationCostUsd: "0",
    totalCostUsd: "0",
    isStreaming: false,
    latencyMs: 11900,
    statusCode: 200,
    createdAt: 1,
    dataSource: "proxy",
    ...overrides,
  };
}

describe("usage display semantics", () => {
  it("distinguishes missing usage from explicit zero usage", () => {
    expect(isUsageUnavailable(log())).toBe(true);
    expect(
      isUsageUnavailable(
        log({ requestId: "session:codex:codex-official:resp-zero" }),
      ),
    ).toBe(false);
  });
  it("does not mistake all-cached input for missing usage", () => {
    expect(
      isUsageUnavailable(log({ inputTokens: 100, cacheReadTokens: 100 })),
    ).toBe(false);
  });
  it("shows account billing instead of pretending an unknown model is free", () => {
    expect(usageCostState(log())).toBe("account");
    expect(usageCostState(log({ inputTokens: 20, outputTokens: 5 }))).toBe(
      "account",
    );
    expect(usageCostState(log({ inputTokens: 20, totalCostUsd: "1.23" }))).toBe(
      "account",
    );
  });
  it("keeps unconfirmed imported usage separate from official attribution", () => {
    const imported = log({
      providerId: "_codex_session",
      dataSource: "codex_session",
      inputTokens: 225330,
      cacheReadTokens: 224256,
      outputTokens: 94,
    });
    expect(isCodexSessionImport(imported)).toBe(true);
    expect(usageCostState(imported)).toBe("unpriced");
  });
  it("preserves priced API requests and genuine zero multiplier pricing", () => {
    expect(
      usageCostState(
        log({ providerId: "custom-api", inputTokens: 20, totalCostUsd: "0.1" }),
      ),
    ).toBe("priced");
    expect(
      usageCostState(
        log({ providerId: "custom-api", inputTokens: 20, costMultiplier: "0" }),
      ),
    ).toBe("priced");
    expect(usageCostState(log({ providerId: "custom-api" }))).toBe(
      "unavailable",
    );
  });
});
