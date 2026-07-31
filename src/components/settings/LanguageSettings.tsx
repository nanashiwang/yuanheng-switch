import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGE_OPTIONS, type AppLanguage } from "@/i18n/languages";
import { useTranslation } from "react-i18next";

interface LanguageSettingsProps {
  value: AppLanguage;
  onChange: (value: AppLanguage) => void;
}

export function LanguageSettings({ value, onChange }: LanguageSettingsProps) {
  const { t } = useTranslation();

  return (
    <section className="space-y-2">
      <header className="space-y-1">
        <h3 className="text-sm font-medium">{t("settings.language")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("settings.languageHint")}
        </p>
      </header>
      <Select
        value={value}
        onValueChange={(next) => onChange(next as AppLanguage)}
      >
        <SelectTrigger className="w-full max-w-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LANGUAGE_OPTIONS.map((language) => (
            <SelectItem key={language.code} value={language.code}>
              {language.nativeName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </section>
  );
}
