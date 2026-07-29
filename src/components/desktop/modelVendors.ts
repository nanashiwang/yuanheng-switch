export interface ModelVendorGroup {
  id: string;
  label: string;
  icon: string;
  models: string[];
}

interface ModelVendorDefinition {
  id: string;
  label: string;
  icon: string;
  aliases: string[];
  patterns: RegExp[];
}

const MODEL_VENDOR_DEFINITIONS: ModelVendorDefinition[] = [
  {
    id: "openai",
    label: "OpenAI",
    icon: "openai",
    aliases: ["openai"],
    patterns: [/^(?:gpt|chatgpt)(?:[-_.]|$)/, /^o[134](?:[-_.]|$)/, /codex/],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    icon: "anthropic",
    aliases: ["anthropic", "claude"],
    patterns: [/^claude(?:[-_.]|$)/],
  },
  {
    id: "google",
    label: "Google",
    icon: "gemini",
    aliases: ["google", "gemini"],
    patterns: [/^gemini(?:[-_.]|$)/],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    icon: "deepseek",
    aliases: ["deepseek"],
    patterns: [/^deepseek(?:[-_.]|$)/],
  },
  {
    id: "xai",
    label: "xAI",
    icon: "grok",
    aliases: ["xai", "grok"],
    patterns: [/^grok(?:[-_.]|$)/],
  },
  {
    id: "qwen",
    label: "阿里千问",
    icon: "qwen",
    aliases: ["alibaba", "dashscope", "qwen", "tongyi"],
    patterns: [/^qwen(?:\d|[-_.]|$)/, /^(?:qwq|qvq)(?:[-_.]|$)/],
  },
  {
    id: "zhipu",
    label: "智谱 AI",
    icon: "zhipu",
    aliases: ["zhipu", "bigmodel", "chatglm", "glm"],
    patterns: [/^(?:glm|chatglm)(?:[-_.]|$)/],
  },
  {
    id: "kimi",
    label: "月之暗面",
    icon: "kimi",
    aliases: ["kimi", "moonshot"],
    patterns: [/^(?:kimi|moonshot)(?:[-_.]|$)/, /^k\d+(?:[-_.]|$)/],
  },
  {
    id: "minimax",
    label: "MiniMax",
    icon: "minimax",
    aliases: ["minimax"],
    patterns: [/^minimax(?:[-_.]|$)/],
  },
  {
    id: "doubao",
    label: "字节豆包",
    icon: "doubao",
    aliases: ["bytedance", "doubao", "volcengine"],
    patterns: [/^(?:doubao|seed)(?:[-_.]|$)/],
  },
  {
    id: "meta",
    label: "Meta",
    icon: "meta",
    aliases: ["meta", "llama"],
    patterns: [/^llama(?:[-_.]|$)/],
  },
  {
    id: "mistral",
    label: "Mistral",
    icon: "mistral",
    aliases: ["mistral"],
    patterns: [/^(?:mistral|codestral|pixtral)(?:[-_.]|$)/],
  },
  {
    id: "cohere",
    label: "Cohere",
    icon: "cohere",
    aliases: ["cohere"],
    patterns: [/^(?:command|cohere)(?:[-_.]|$)/],
  },
  {
    id: "baidu",
    label: "百度文心",
    icon: "baidu",
    aliases: ["baidu", "ernie"],
    patterns: [/^ernie(?:[-_.]|$)/],
  },
  {
    id: "hunyuan",
    label: "腾讯混元",
    icon: "tencent",
    aliases: ["tencent", "hunyuan"],
    patterns: [/^hunyuan(?:[-_.]|$)/],
  },
  {
    id: "mimo",
    label: "小米 MiMo",
    icon: "xiaomi",
    aliases: ["xiaomi", "mimo"],
    patterns: [/^mimo(?:[-_.]|$)/],
  },
  {
    id: "stepfun",
    label: "阶跃星辰",
    icon: "stepfun",
    aliases: ["stepfun"],
    patterns: [/^step(?:[-_.]|$)/],
  },
  {
    id: "longcat",
    label: "美团 LongCat",
    icon: "longcat",
    aliases: ["longcat", "meituan"],
    patterns: [/^longcat(?:[-_.]|$)/],
  },
];

const VENDOR_BY_ALIAS = new Map(
  MODEL_VENDOR_DEFINITIONS.flatMap((vendor) =>
    vendor.aliases.map((alias) => [alias, vendor] as const),
  ),
);
const VENDOR_ORDER = new Map(
  MODEL_VENDOR_DEFINITIONS.map((vendor, index) => [vendor.id, index]),
);

export function modelVendorOf(model: string): Omit<ModelVendorGroup, "models"> {
  const normalized = model.trim().toLowerCase();
  const segments = normalized.split(/[/:]/).filter(Boolean);
  const modelName = segments.at(-1) ?? normalized;

  for (const segment of segments) {
    const vendor = VENDOR_BY_ALIAS.get(segment);
    if (vendor) {
      return { id: vendor.id, label: vendor.label, icon: vendor.icon };
    }
  }

  for (const vendor of MODEL_VENDOR_DEFINITIONS) {
    if (vendor.patterns.some((pattern) => pattern.test(modelName))) {
      return { id: vendor.id, label: vendor.label, icon: vendor.icon };
    }
  }

  return { id: "other", label: "其他模型", icon: "models" };
}

export function groupModelsByVendor(models: string[]): ModelVendorGroup[] {
  const grouped = new Map<string, ModelVendorGroup>();
  for (const model of models) {
    const vendor = modelVendorOf(model);
    const group = grouped.get(vendor.id);
    if (group) {
      group.models.push(model);
    } else {
      grouped.set(vendor.id, { ...vendor, models: [model] });
    }
  }

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      models: [...group.models].sort((left, right) =>
        left.localeCompare(right),
      ),
    }))
    .sort(
      (left, right) =>
        (VENDOR_ORDER.get(left.id) ?? Number.POSITIVE_INFINITY) -
          (VENDOR_ORDER.get(right.id) ?? Number.POSITIVE_INFINITY) ||
        left.label.localeCompare(right.label),
    );
}
