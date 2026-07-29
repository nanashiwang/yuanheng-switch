import { describe, expect, it } from "vitest";
import {
  groupModelsByVendor,
  modelVendorOf,
  sortModelNames,
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

  it("同一供应商按稳定版本从新到旧排列", () => {
    expect(
      sortModelNames([
        "gpt-4.1-mini",
        "gpt-5.6-mini",
        "gpt-5.4",
        "gpt-5.6-preview",
        "gpt-5.6",
        "o4-mini",
      ]),
    ).toEqual([
      "gpt-5.6",
      "gpt-5.6-mini",
      "gpt-5.4",
      "gpt-4.1-mini",
      "o4-mini",
      "gpt-5.6-preview",
    ]);
  });

  it("同版本优先展示高能力档位并把预览版后置", () => {
    expect(
      sortModelNames([
        "claude-haiku-4-5",
        "claude-sonnet-4-8-preview",
        "claude-sonnet-4-7",
        "claude-sonnet-4-8",
        "claude-opus-4-8",
      ]),
    ).toEqual([
      "claude-opus-4-8",
      "claude-sonnet-4-8",
      "claude-sonnet-4-7",
      "claude-haiku-4-5",
      "claude-sonnet-4-8-preview",
    ]);
  });

  it("当前与推荐模型固定在最前，其余仍按统一规则排序", () => {
    expect(
      sortModelNames(
        ["gpt-5.4", "gpt-5.6-mini", "gpt-5.6", "gpt-4.1-mini"],
        ["gpt-5.4", "gpt-5.6-mini"],
      ),
    ).toEqual(["gpt-5.4", "gpt-5.6-mini", "gpt-5.6", "gpt-4.1-mini"]);
  });
});
