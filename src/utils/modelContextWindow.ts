/**
 * Shared model context-window policy.
 *
 * Values here are client-side declarations, not a promise that every upstream
 * endpoint accepts the same window. Callers should still take the minimum of
 * this value, the endpoint/provider limit, and any user override.
 */

export type ContextAwareAgent =
  | "codex"
  | "claude"
  | "grokbuild"
  | "opencode"
  | "openclaw"
  | "hermes";

export const CONSERVATIVE_UNKNOWN_CONTEXT_WINDOW = 128_000;

const MODEL_CONTEXT_WINDOWS: Array<{
  pattern: RegExp;
  window: number;
}> = [
  // YuanHeng's Codex GPT-5.6 catalog exposes a 921K effective window.
  { pattern: /^gpt-5\.6(?:$|[-.])/, window: 921_000 },
  { pattern: /^gpt-5\.5(?:$|[-.])/, window: 400_000 },
  { pattern: /^gpt-5(?:$|[-.])/, window: 400_000 },
  { pattern: /^(?:deepseek[-/])?v4(?:[-/]|$)/, window: 1_000_000 },
  { pattern: /^deepseek[-/]r1(?:[-/]|$)/, window: 128_000 },
  { pattern: /^kimi[-/]k3(?:[-/]|$)/, window: 1_048_576 },
  { pattern: /^kimi[-/]k2\.6(?:[-/]|$)/, window: 262_144 },
  { pattern: /^kimi[-/]k2(?:[-/]|$)/, window: 262_144 },
  {
    pattern: /^claude-(?:opus-4[.-]8|sonnet-5)(?:[-.]|$)/,
    window: 1_000_000,
  },
  { pattern: /^claude-(?:opus|sonnet|haiku)-4\.5(?:[-.]|$)/, window: 200_000 },
  { pattern: /^claude-(?:opus|sonnet|haiku)(?:[-.]|$)/, window: 200_000 },
  { pattern: /^gemini[-/].*/, window: 1_048_576 },
  { pattern: /^grok[-/].*/, window: 500_000 },
  { pattern: /^grok-.*/, window: 500_000 },
  { pattern: /^glm[-/].*/, window: 204_800 },
  { pattern: /^glm-.*/, window: 204_800 },
  { pattern: /^minimax[-/].*/, window: 204_800 },
  { pattern: /^minimax-.*/, window: 204_800 },
  { pattern: /^qwen[-/].*/, window: 1_000_000 },
  { pattern: /^qwen-.*/, window: 1_000_000 },
  { pattern: /^ark-code-latest$/, window: 256_000 },
  { pattern: /^step[-/].*/, window: 262_144 },
];

/** Normalize vendor-prefixed IDs and client-only [1M] markers. */
export function normalizeContextModelId(
  model: string | undefined | null,
): string {
  return (
    (model ?? "")
      .trim()
      .replace(/\s*\[1m\]\s*$/i, "")
      .toLowerCase()
      .split("/")
      .pop()
      ?.trim() ?? ""
  );
}

/** Return a known model declaration, or undefined when the model is unknown. */
export function getKnownModelContextWindow(
  model: string | undefined | null,
): number | undefined {
  const normalized = normalizeContextModelId(model);
  if (!normalized) return undefined;
  return MODEL_CONTEXT_WINDOWS.find(({ pattern }) => pattern.test(normalized))
    ?.window;
}

/**
 * Resolve the effective client declaration for an Agent.
 * Unknown models intentionally use a conservative fallback only when the
 * caller explicitly requests one; otherwise undefined means "do not invent".
 */
export function resolveModelContextWindow(
  model: string | undefined | null,
  options: { fallback?: number } = {},
): number | undefined {
  return (
    getKnownModelContextWindow(model) ??
    (Number.isInteger(options.fallback) && options.fallback! > 0
      ? options.fallback
      : undefined)
  );
}

export function modelSupportsOneMillionContext(
  model: string | undefined | null,
): boolean {
  return (getKnownModelContextWindow(model) ?? 0) >= 1_000_000;
}

/**
 * Apply Claude Code's model-aware defaults without overwriting user values.
 * The primary model controls the global context knobs; role-specific model
 * values receive the [1M] marker only when that model is known to support it.
 */
export function applyClaudeContextDefaults(
  config: Record<string, any>,
): Record<string, any> {
  const env = config.env;
  if (!env || typeof env !== "object" || Array.isArray(env)) return config;

  const primary =
    env.ANTHROPIC_MODEL ||
    env.ANTHROPIC_DEFAULT_SONNET_MODEL ||
    env.ANTHROPIC_DEFAULT_OPUS_MODEL ||
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
  const context = getKnownModelContextWindow(primary);
  if (context && !env.CLAUDE_CODE_MAX_CONTEXT_TOKENS) {
    env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = String(context);
  }
  if (context && !env.CLAUDE_CODE_AUTO_COMPACT_WINDOW) {
    env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = String(context);
  }

  for (const key of [
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_FABLE_MODEL",
    "CLAUDE_CODE_SUBAGENT_MODEL",
  ]) {
    const value = env[key];
    if (
      typeof value === "string" &&
      modelSupportsOneMillionContext(value) &&
      !/\s*\[1m\]\s*$/i.test(value)
    ) {
      env[key] = `${value.trim()}[1M]`;
    }
  }
  return config;
}

/** Fill only missing model-level fields for the JSON-backed Agents. */
export function applyAgentModelContextDefaults(
  agent: Exclude<ContextAwareAgent, "claude" | "codex" | "grokbuild">,
  config: Record<string, any>,
): Record<string, any> {
  if (agent === "openclaw" && Array.isArray(config.models)) {
    for (const model of config.models) {
      if (
        !model ||
        typeof model !== "object" ||
        (Number.isInteger(model.contextWindow) && model.contextWindow > 0)
      )
        continue;
      const inferred = getKnownModelContextWindow(model.id);
      if (inferred) model.contextWindow = inferred;
    }
  }

  if (agent === "hermes" && Array.isArray(config.models)) {
    for (const model of config.models) {
      if (
        !model ||
        typeof model !== "object" ||
        (Number.isInteger(model.context_length) && model.context_length > 0)
      )
        continue;
      const inferred = getKnownModelContextWindow(model.id);
      if (inferred) model.context_length = inferred;
    }
  }

  if (
    agent === "opencode" &&
    config.models &&
    typeof config.models === "object"
  ) {
    for (const [id, model] of Object.entries(
      config.models as Record<string, any>,
    )) {
      if (!model || typeof model !== "object") continue;
      const inferred = getKnownModelContextWindow(id);
      if (!inferred) continue;
      if (
        !model.limit ||
        typeof model.limit !== "object" ||
        Array.isArray(model.limit)
      ) {
        model.limit = {};
      }
      if (!model.limit.context) model.limit.context = inferred;
    }
  }

  return config;
}

export function applyCodexCatalogContextDefaults<T extends Record<string, any>>(
  models: T[],
): T[] {
  return models.map((model) => {
    if (model.contextWindow) return model;
    const inferred = getKnownModelContextWindow(model.model);
    return inferred ? { ...model, contextWindow: inferred } : model;
  });
}
