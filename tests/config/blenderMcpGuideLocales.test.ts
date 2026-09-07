import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en.json";
import ja from "@/i18n/locales/ja.json";
import ko from "@/i18n/locales/ko.json";
import zh from "@/i18n/locales/zh.json";
import zhTW from "@/i18n/locales/zh-TW.json";

const guides = { en, ja, ko, zh, zhTW } as const;

describe("Blender MCP beginner guide locales", () => {
  it("keeps every locale complete and preserves template placeholders", () => {
    const english = en.mcp.presets["blender-mcp"].guide;
    const expectedKeys = Object.keys(english).sort();

    for (const [locale, resource] of Object.entries(guides)) {
      const guide = resource.mcp.presets["blender-mcp"].guide;
      expect(Object.keys(guide).sort(), locale).toEqual(expectedKeys);
      for (const [key, value] of Object.entries(guide)) {
        expect(value.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
        expect(
          value.match(/\{\{[^{}]+\}\}/g) ?? [],
          `${locale}.${key}`,
        ).toEqual(
          english[key as keyof typeof english].match(/\{\{[^{}]+\}\}/g) ?? [],
        );
      }
    }
  });

  it("keeps the test prompt read-only in every locale", () => {
    expect(zh.mcp.presets["blender-mcp"].guide.testPrompt).toContain(
      "不要修改",
    );
    expect(zhTW.mcp.presets["blender-mcp"].guide.testPrompt).toContain(
      "不要修改",
    );
    expect(en.mcp.presets["blender-mcp"].guide.testPrompt).toContain(
      "Do not change",
    );
    expect(ja.mcp.presets["blender-mcp"].guide.testPrompt).toContain(
      "変更しない",
    );
    expect(ko.mcp.presets["blender-mcp"].guide.testPrompt).toContain(
      "변경하지 마세요",
    );
  });
});
