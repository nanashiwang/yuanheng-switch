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

describe("locale resources", () => {
  it.each(Object.entries(locales))(
    "%s includes the language selector and desktop shell keys",
    (_name, locale) => {
      expect(locale.settings.language).toBeTruthy();
      expect(locale.settings.languageHint).toBeTruthy();
      expect(locale.desktop.toolbar.language).toBeTruthy();
      expect(locale.desktop.views.settings).toBeTruthy();
      expect(locale.desktop.window.close).toBeTruthy();
    },
  );
});
