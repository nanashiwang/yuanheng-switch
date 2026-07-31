import { AlignJustify, Rows3 } from "lucide-react";
import { useUiDensity, type UiDensity } from "@/hooks/useUiDensity";
import { cn } from "@/lib/utils";

const options: Array<{
  value: UiDensity;
  label: string;
  description: string;
  icon: typeof Rows3;
}> = [
  {
    value: "comfortable",
    label: "舒适",
    description: "更宽松的间距，适合日常使用",
    icon: Rows3,
  },
  {
    value: "compact",
    label: "紧凑",
    description: "减少留白，同屏显示更多内容",
    icon: AlignJustify,
  },
];

export function DensitySettings() {
  const { density, setDensity } = useUiDensity();

  return (
    <section className="settings-row space-y-3 py-4">
      <header>
        <h3 className="text-sm font-medium">界面密度</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          调整页面留白与信息密度，修改后立即生效。
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
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[10px] opacity-75">
                  {option.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
