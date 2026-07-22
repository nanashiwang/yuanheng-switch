import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-6 pb-5">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] text-foreground">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  );
}
