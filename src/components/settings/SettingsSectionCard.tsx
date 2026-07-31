import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsSectionCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}

export function SettingsSectionCard({
  title,
  description,
  icon: Icon,
  children,
  className,
}: SettingsSectionCardProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-card/75 shadow-sm",
        className,
      )}
    >
      <header className="flex items-start gap-3 border-b bg-muted/20 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {description}
          </p>
        </div>
      </header>
      <div className="settings-section-content divide-y divide-border/60 px-5">
        {children}
      </div>
    </section>
  );
}
