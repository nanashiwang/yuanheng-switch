import React from "react";

interface ListItemRowProps extends React.HTMLAttributes<HTMLDivElement> {
  isLast?: boolean;
  children: React.ReactNode;
}

export const ListItemRow = React.forwardRef<HTMLDivElement, ListItemRowProps>(
  ({ isLast, children, className = "", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors ${
          !isLast ? "border-b border-border-default" : ""
        } ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  },
);

ListItemRow.displayName = "ListItemRow";
