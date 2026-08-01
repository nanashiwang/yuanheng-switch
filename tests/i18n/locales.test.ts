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
