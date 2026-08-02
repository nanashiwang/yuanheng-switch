import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import zh from "./locales/zh.json";
import zhTW from "./locales/zh-TW.json";
import {
  DEFAULT_LANGUAGE,
  applyLanguageToDocument,
  normalizeLanguage,
  persistLanguage,
  readStoredLanguage,
} from "./languages";

const resources = {
  en: { translation: en },
  "zh-CN": { translation: zh },
  "zh-TW": { translation: zhTW },
  ja: { translation: ja },
  ko: { translation: ko },
};

const initialLanguage = readStoredLanguage();
applyLanguageToDocument(initialLanguage);

i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: Object.keys(resources),
  load: "currentOnly",
  interpolation: {
    escapeValue: false,
  },
  debug: false,
});

i18n.on("languageChanged", (language) => {
  const normalized = normalizeLanguage(language);
  persistLanguage(normalized);
  applyLanguageToDocument(normalized);
});

export default i18n;
