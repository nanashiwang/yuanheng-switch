export const LANGUAGE_OPTIONS = [
  { code: "en", nativeName: "English", htmlLang: "en" },
  { code: "zh-CN", nativeName: "简体中文", htmlLang: "zh-CN" },
  { code: "zh-TW", nativeName: "繁體中文", htmlLang: "zh-TW" },
  { code: "ja", nativeName: "日本語", htmlLang: "ja" },
  { code: "ko", nativeName: "한국어", htmlLang: "ko" },
] as const;

export type AppLanguage = (typeof LANGUAGE_OPTIONS)[number]["code"];

export const DEFAULT_LANGUAGE: AppLanguage = "en";
export const LANGUAGE_STORAGE_KEY = "language";

export function normalizeLanguage(language?: string | null): AppLanguage {
  if (!language) return DEFAULT_LANGUAGE;

  const normalized = language.trim().toLowerCase().replace(/_/g, "-");
  if (!normalized) return DEFAULT_LANGUAGE;

  if (
    normalized === "zh-tw" ||
    normalized.startsWith("zh-hant") ||
    normalized.startsWith("zh-hk") ||
    normalized.startsWith("zh-mo")
  ) {
    return "zh-TW";
  }

  if (
    normalized === "zh" ||
    normalized === "zh-cn" ||
    normalized.startsWith("zh-hans") ||
    normalized.startsWith("zh-sg")
  ) {
    return "zh-CN";
  }

  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("ko")) return "ko";

  return DEFAULT_LANGUAGE;
}

export function isSupportedLanguage(language?: string | null): boolean {
  if (!language) return false;
  const raw = language.trim().toLowerCase().replace(/_/g, "-");
  return (
    raw === "en" ||
    raw === "ja" ||
    raw === "ko" ||
    raw === "zh" ||
    raw.startsWith("zh-") ||
    raw.startsWith("en-") ||
    raw.startsWith("ja-") ||
    raw.startsWith("ko-")
  );
}

export function readStoredLanguage(): AppLanguage {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;

  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored && isSupportedLanguage(stored)
      ? normalizeLanguage(stored)
      : DEFAULT_LANGUAGE;
  } catch (error) {
    console.warn("[i18n] Failed to read stored language preference", error);
    return DEFAULT_LANGUAGE;
  }
}

export function persistLanguage(language: AppLanguage): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch (error) {
    console.warn("[i18n] Failed to persist language preference", error);
  }
}

export function applyLanguageToDocument(language: AppLanguage): void {
  if (typeof document === "undefined") return;
  const option = LANGUAGE_OPTIONS.find((item) => item.code === language);
  document.documentElement.lang = option?.htmlLang ?? DEFAULT_LANGUAGE;
  document.documentElement.dir = "ltr";
}
