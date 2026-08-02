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
  ] as const)("normalizes %s to %s", (input, expected) => {
    expect(normalizeLanguage(input)).toBe(expected);
  });

  it.each(["es-MX", "de-DE", "fr-CA", "pt-BR"])(
    "treats removed language %s as unsupported and falls back to English",
    (language) => {
      expect(isSupportedLanguage(language)).toBe(false);
      expect(normalizeLanguage(language)).toBe("en");
    },
  );

  it("persists language and updates the document metadata", () => {
    persistLanguage("ko");
    applyLanguageToDocument("ko");

    expect(readStoredLanguage()).toBe("ko");
    expect(document.documentElement.lang).toBe("ko");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("registers every supported product language once", () => {
    expect(LANGUAGE_OPTIONS.map(({ code }) => code)).toEqual([
      "en",
      "zh-CN",
      "zh-TW",
      "ja",
      "ko",
    ]);
  });
});
