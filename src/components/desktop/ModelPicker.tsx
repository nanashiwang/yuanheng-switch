import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function ModelPicker({
  models,
  value,
  recommended,
  label,
  disabled,
  className,
  triggerLabel,
  onChange,
  onRefresh,
}: {
  models: string[];
  value?: string;
  recommended?: string | null;
  label: string;
  disabled?: boolean;
  className?: string;
  triggerLabel?: string;
  onChange: (value: string) => void;
  onRefresh?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const orderedModels = useMemo(() => {
    const priority = [value, recommended].filter((item): item is string =>
      Boolean(item),
    );
    return [...models].sort((left, right) => {
      const leftPriority = priority.indexOf(left);
      const rightPriority = priority.indexOf(right);
      if (leftPriority !== -1 || rightPriority !== -1) {
        if (leftPriority === -1) return 1;
        if (rightPriority === -1) return -1;
        return leftPriority - rightPriority;
      }
      return left.localeCompare(right);
    });
  }, [models, recommended, value]);

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) onRefresh?.();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "mt-1.5 flex h-8 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-left text-[11px] shadow-sm disabled:cursor-not-allowed disabled:opacity-60",
            className,
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <span className="truncate">
            {triggerLabel ?? (value || "选择模型")}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[1000] w-[var(--radix-popover-trigger-width)] min-w-[320px] p-0"
        onClick={(event) => event.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="搜索网站可用模型..." />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>没有找到匹配的模型</CommandEmpty>
            <CommandGroup
              heading={`账号当前可用 ${orderedModels.length} 个模型`}
            >
              {orderedModels.map((model) => (
                <CommandItem
                  key={model}
                  value={model}
                  onSelect={() => {
                    onChange(model);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-1 h-3.5 w-3.5",
                      value === model ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{model}</span>
                  {model === recommended && (
                    <span className="shrink-0 text-[9px] text-emerald-600">
                      推荐
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
