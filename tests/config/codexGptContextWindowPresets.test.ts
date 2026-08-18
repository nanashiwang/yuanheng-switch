import { describe, expect, it } from "vitest";
import {
  codexProviderPresets,
  generateThirdPartyConfig,
} from "@/config/codexProviderPresets";
import {
  CODEX_GPT_CONTEXT_WINDOW,
  extractCodexModelName,
  extractCodexTopLevelInt,
  isCodexGptModel,
} from "@/utils/providerConfigUtils";

describe("Codex GPT context-window presets", () => {
  it("adds 921K to every built-in GPT preset at the top level", () => {
    const gptPresets = codexProviderPresets.filter((preset) =>
      isCodexGptModel(extractCodexModelName(preset.config)),
    );

    expect(gptPresets.length).toBeGreaterThan(0);
    for (const preset of gptPresets) {
      expect(
        extractCodexTopLevelInt(preset.config, "model_context_window"),
        preset.name,
      ).toBe(CODEX_GPT_CONTEXT_WINDOW);
    }
  });

  it("does not declare the GPT window for non-GPT generated configs", () => {
    const config = generateThirdPartyConfig(
      "MiniMax",
      "https://example.com/v1",
      "MiniMax-M3",
    );

    expect(
      extractCodexTopLevelInt(config, "model_context_window"),
    ).toBeUndefined();
  });

  it("removes the obsolete nested 1M values from E-FlowCode", () => {
    const preset = codexProviderPresets.find(
      (item) => item.name === "E-FlowCode",
    );

    expect(preset).toBeDefined();
    expect(preset?.config).not.toContain("1000000");
    expect(preset?.config).not.toContain("9000000");
    expect(
      extractCodexTopLevelInt(preset?.config ?? "", "model_context_window"),
    ).toBe(CODEX_GPT_CONTEXT_WINDOW);
  });
});
