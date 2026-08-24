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
import { modelVendorOf, sortModelNames } from "./modelVendors";
import { dt } from "./desktopI18n";

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
  modelMeta,
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
  modelMeta?: Record<
    string,
    { groups?: number; reasoningLevels?: number; available?: boolean }
  >;
}) {
  const [open, setOpen] = useState(false);
  const orderedModels = useMemo(
    () => sortModelNames(models, [value, recommended]),
    [models, recommended, value],
  );

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
            {triggerLabel ?? (value || dt("选择模型"))}
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
          <CommandInput placeholder={dt("搜索网站可用模型...")} />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>{dt("没有找到匹配的模型")}</CommandEmpty>
            <CommandGroup
              heading={dt("当前/推荐优先 · 新版本在前 · 共 {{count}} 个", {
                count: orderedModels.length,
              })}
            >
              {orderedModels.map((model) => {
                const vendor = modelVendorOf(model);
                const meta = modelMeta?.[model];
                return (
                  <CommandItem
                    key={model}
                    value={`${model} ${vendor.label}`}
                    disabled={meta?.available === false}
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
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{model}</span>
                      <span className="block truncate text-[9px] text-muted-foreground">
                        {vendor.label}
                        {meta?.groups ? ` · ${meta.groups} ${dt("分组")}` : ""}
                        {meta?.reasoningLevels
                          ? ` · ${meta.reasoningLevels} ${dt("推理等级")}`
                          : ""}
                      </span>
                    </span>
                    {model === value && (
                      <span className="shrink-0 text-[9px] font-medium text-primary">
                        {dt("当前")}
                      </span>
                    )}
                    {model === recommended && (
                      <span className="shrink-0 text-[9px] text-emerald-600">
                        {dt("推荐")}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
