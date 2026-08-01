import { AlignJustify, Rows3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUiDensity, type UiDensity } from "@/hooks/useUiDensity";
import { cn } from "@/lib/utils";

const options: Array<{
  value: UiDensity;
  labelKey: string;
  descriptionKey: string;
  icon: typeof Rows3;
}> = [
  {
    value: "comfortable",
    labelKey: "settings.densityComfortable",
    descriptionKey: "settings.densityComfortableDescription",
    icon: Rows3,
  },
  {
    value: "compact",
    labelKey: "settings.densityCompact",
    descriptionKey: "settings.densityCompactDescription",
    icon: AlignJustify,
  },
];

export function DensitySettings() {
  const { t } = useTranslation();
  const { density, setDensity } = useUiDensity();

  return (
    <section className="settings-row space-y-3 py-4">
      <header>
        <h3 className="text-sm font-medium">
          {t("settings.interfaceDensity")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("settings.interfaceDensityDescription")}
        </p>
      </header>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const Icon = option.icon;
          const selected = density === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setDensity(option.value)}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                selected
                  ? "border-primary/45 bg-primary/8 text-foreground"
                  : "border-border/70 bg-background/60 text-muted-foreground hover:border-primary/25 hover:text-foreground",
              )}
              aria-pressed={selected}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>
                <span className="block text-xs font-semibold">
                  {t(option.labelKey)}
                </span>
                <span className="mt-0.5 block text-[10px] opacity-75">
                  {t(option.descriptionKey)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
