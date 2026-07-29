import { describe, expect, it } from "vitest";
import {
  groupModelsByVendor,
  modelVendorOf,
} from "@/components/desktop/modelVendors";

describe("modelVendors", () => {
  it.each([
    ["gpt-5.6", "openai"],
    ["anthropic/claude-opus-4-8", "anthropic"],
    ["openrouter/google/gemini-3-pro", "google"],
    ["deepseek-v4-pro", "deepseek"],
    ["qwen3-coder", "qwen"],
    ["glm-5", "zhipu"],
    ["k3", "kimi"],
    ["doubao-seed-2.0", "doubao"],
  ])("识别 %s 的模型供应商", (model, vendor) => {
    expect(modelVendorOf(model).id).toBe(vendor);
  });

  it("按供应商聚合并保留每个模型", () => {
    const groups = groupModelsByVendor([
      "claude-sonnet-5",
      "gpt-5.6",
      "gpt-5.6-mini",
      "unknown-model",
    ]);

    expect(groups).toEqual([
      expect.objectContaining({
        id: "openai",
        models: ["gpt-5.6", "gpt-5.6-mini"],
      }),
      expect.objectContaining({
        id: "anthropic",
        models: ["claude-sonnet-5"],
      }),
      expect.objectContaining({
        id: "other",
        models: ["unknown-model"],
      }),
    ]);
  });
});
