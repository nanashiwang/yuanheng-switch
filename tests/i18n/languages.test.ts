import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  applyLanguageToDocument,
  isSupportedLanguage,
  normalizeLanguage,
  persistLanguage,
  readStoredLanguage,
} from "@/i18n/languages";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = "";
});

describe("language registry", () => {
  it("defaults new installations and invalid values to English", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
    expect(readStoredLanguage()).toBe("en");
    expect(normalizeLanguage("unsupported")).toBe("en");
    expect(isSupportedLanguage("unsupported")).toBe(false);
  });

  it.each([
    ["zh", "zh-CN"],
    ["zh_Hans_SG", "zh-CN"],
    ["zh-Hant-HK", "zh-TW"],
    ["en-US", "en"],
    ["ja-JP", "ja"],
    ["ko-KR", "ko"],
    ["es-MX", "es"],
    ["de-DE", "de"],
    ["fr-CA", "fr"],
    ["pt-PT", "pt-BR"],
  ] as const)("normalizes %s to %s", (input, expected) => {
    expect(normalizeLanguage(input)).toBe(expected);
  });

  it("persists language and updates the document metadata", () => {
    persistLanguage("fr");
    applyLanguageToDocument("fr");

    expect(readStoredLanguage()).toBe("fr");
    expect(document.documentElement.lang).toBe("fr");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("registers every supported product language once", () => {
    expect(LANGUAGE_OPTIONS.map(({ code }) => code)).toEqual([
      "en",
      "zh-CN",
      "zh-TW",
      "ja",
      "ko",
      "es",
      "de",
      "fr",
      "pt-BR",
    ]);
  });
});
