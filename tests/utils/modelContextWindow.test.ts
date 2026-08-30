import { describe, expect, it } from "vitest";
import {
  applyAgentModelContextDefaults,
  applyClaudeContextDefaults,
  applyCodexCatalogContextDefaults,
  getKnownModelContextWindow,
  normalizeContextModelId,
  resolveModelContextWindow,
} from "@/utils/modelContextWindow";

describe("model context-window policy", () => {
  it("normalizes vendor prefixes and markers", () => {
    expect(normalizeContextModelId("anthropic/Claude-Sonnet-5[1M]")).toBe(
      "claude-sonnet-5",
    );
    expect(getKnownModelContextWindow("deepseek-v4-pro")).toBe(1_000_000);
  });

  it("uses a conservative fallback only when requested", () => {
    expect(resolveModelContextWindow("vendor/unknown")).toBeUndefined();
    expect(resolveModelContextWindow("vendor/unknown", { fallback: 128_000 })).toBe(
      128_000,
    );
  });

  it("fills missing model-level fields without overwriting explicit values", () => {
    const config = {
      models: [
        { id: "deepseek-v4-flash", name: "DeepSeek" },
        { id: "grok-4.5", contextWindow: 300_000 },
      ],
    };
    applyAgentModelContextDefaults("openclaw", config);
    expect(config.models[0].contextWindow).toBe(1_000_000);
    expect(config.models[1].contextWindow).toBe(300_000);
  });

  it("maps OpenCode and Codex catalog fields", () => {
    const opencode: Record<string, any> = {
      models: { "kimi-k3": { name: "Kimi" }, "custom/model": { name: "Custom" } },
    };
    applyAgentModelContextDefaults("opencode", opencode);
    expect(opencode.models["kimi-k3"].limit.context).toBe(1_048_576);
    expect(opencode.models["custom/model"].limit).toBeUndefined();

    const catalog = applyCodexCatalogContextDefaults([
      { model: "deepseek-v4-flash" },
      { model: "custom", contextWindow: 222_000 },
    ]);
    expect(catalog[0].contextWindow).toBe(1_000_000);
    expect(catalog[1].contextWindow).toBe(222_000);
  });

  it("backfills Claude Code context and 1M markers", () => {
    const config: Record<string, any> = {
      env: {
        ANTHROPIC_MODEL: "anthropic/claude-sonnet-5",
      },
    };
    applyClaudeContextDefaults(config);
    expect(config.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS).toBe("1000000");
    expect(config.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe("1000000");
    expect(config.env.ANTHROPIC_MODEL).toBe("anthropic/claude-sonnet-5[1M]");
  });
});
