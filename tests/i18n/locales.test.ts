import { describe, expect, it } from "vitest";

import de from "@/i18n/locales/de.json";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import ja from "@/i18n/locales/ja.json";
import ko from "@/i18n/locales/ko.json";
import ptBR from "@/i18n/locales/pt-BR.json";
import zh from "@/i18n/locales/zh.json";
import zhTW from "@/i18n/locales/zh-TW.json";

const locales = { en, zh, zhTW, ja, ko, es, de, fr, ptBR };

const completeNonEnglishLocales = { ko, es, de, fr, ptBR };

function flattenStrings(
  value: unknown,
  prefix = "",
  output: Record<string, string> = {},
): Record<string, string> {
  if (typeof value === "string") {
    output[prefix] = value;
    return output;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flattenStrings(child, prefix ? `${prefix}.${key}` : key, output);
    }
  }

  return output;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{[^{}]+\}\}/g)]
    .map(([placeholder]) => placeholder)
    .sort();
}

const requiredLocalizedShellKeys = [
  "pageDescription",
  "appearanceAndLanguage",
  "appearanceAndLanguageDescription",
  "toolsAndCapabilities",
  "toolsAndCapabilitiesDescription",
  "desktopExperience",
  "desktopExperienceDescription",
  "interfaceDensity",
  "interfaceDensityDescription",
  "densityComfortable",
  "densityComfortableDescription",
  "densityCompact",
  "densityCompactDescription",
] as const;

describe("locale resources", () => {
  it.each(Object.entries(locales))(
    "%s includes the language selector and desktop shell keys",
    (_name, locale) => {
      expect(locale.settings.language).toBeTruthy();
      expect(locale.settings.languageHint).toBeTruthy();
      expect(locale.desktop.toolbar.language).toBeTruthy();
      expect(locale.desktop.toolbar.quickActions).toBeTruthy();
      expect(locale.desktop.toolbar.currentStatus).toBeTruthy();
      expect(locale.desktop.toolbar.openCurrentStatusPanel).toBeTruthy();
      expect(locale.desktop.views.settings).toBeTruthy();
      expect(locale.desktop.window.close).toBeTruthy();
      expect(locale.desktop.agents.description).toBeTruthy();
      expect(locale.desktop.agents.comingSoon).toBeTruthy();
      expect(locale.desktop.agents.comingSoonDescription).toBeTruthy();
      expect(locale.deeplink.providerImportRemoved).toBeTruthy();
      expect(locale.deeplink.providerImportRemovedDescription).toBeTruthy();
      for (const key of requiredLocalizedShellKeys) {
        expect(locale.settings[key]).toBeTruthy();
      }
    },
  );

  it.each(Object.entries(completeNonEnglishLocales))(
    "%s has the same string keys and placeholders as English",
    (_name, locale) => {
      const english = flattenStrings(en);
      const localized = flattenStrings(locale);

      expect(Object.keys(localized).sort()).toEqual(
        Object.keys(english).sort(),
      );
      for (const [key, source] of Object.entries(english)) {
        expect(placeholders(localized[key]), key).toEqual(placeholders(source));
      }
    },
  );

  it.each([
    {
      name: "ko",
      locale: ko,
      language: "언어",
      settings: "설정",
      skills: "스킬",
      prompts: "프롬프트",
    },
    {
      name: "es",
      locale: es,
      language: "Idioma",
      settings: "Configuración",
      skills: "Habilidades",
      prompts: "Indicaciones",
    },
    {
      name: "de",
      locale: de,
      language: "Sprache",
      settings: "Einstellungen",
      skills: "Fähigkeiten",
      prompts: "Eingabeaufforderungen",
    },
    {
      name: "fr",
      locale: fr,
      language: "Langue",
      settings: "Paramètres",
      skills: "Compétences",
      prompts: "Invites",
    },
    {
      name: "pt-BR",
      locale: ptBR,
      language: "Idioma",
      settings: "Configurações",
      skills: "Habilidades",
      prompts: "Instruções",
    },
  ])(
    "$name localizes core navigation instead of falling back to English",
    ({ locale, language, settings, skills, prompts }) => {
      expect(locale.settings.language).toBe(language);
      expect(locale.desktop.views.settings).toBe(settings);
      expect(locale.desktop.views.skills).toBe(skills);
      expect(locale.desktop.views.prompts).toBe(prompts);
      expect(locale.settings.language).not.toBe(en.settings.language);
      expect(locale.desktop.views.settings).not.toBe(en.desktop.views.settings);
      expect(locale.desktop.views.skills).not.toBe(en.desktop.views.skills);
      expect(locale.desktop.views.prompts).not.toBe(en.desktop.views.prompts);
      expect(locale.apps).toEqual(en.apps);

      for (const value of Object.values(flattenStrings(locale))) {
        expect(value).not.toMatch(/\bSkills\b|\bPrompts\b/);
        if (locale === ko) expect(value).not.toMatch(/\bAgents\b/);
      }
    },
  );

  it("uses Traditional Chinese for the settings shell", () => {
    expect(zhTW.settings.pageDescription).toBe(
      "主題、語言、目錄、同步與進階選項。",
    );
    expect(zhTW.settings.appearanceAndLanguage).toBe("外觀與語言");
    expect(zhTW.settings.interfaceDensity).toBe("介面密度");
    expect(zhTW.desktop.toolbar.openCurrentStatusPanel).toBe(
      "開啟目前狀態面板",
    );
  });
});
