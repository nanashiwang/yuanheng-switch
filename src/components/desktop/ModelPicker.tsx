import { useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
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
import {
  groupModelsByVendor,
  modelVendorOf,
  sortModelNames,
} from "./modelVendors";
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
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const orderedModels = useMemo(
    () => sortModelNames([...new Set(models)], [value, recommended]),
    [models, recommended, value],
  );

  const vendors = groupModelsByVendor(orderedModels);
  const activeVendor = vendors.some((vendor) => vendor.id === vendorFilter)
    ? vendorFilter
    : "all";
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleModels = orderedModels.filter((model) => {
    const vendor = modelVendorOf(model);
    const text = `${model} ${vendor.label} ${vendor.id}`.toLowerCase();
    return (
      (activeVendor === "all" || vendor.id === activeVendor) &&
      terms.every((term) => text.includes(term))
    );
  });
  const current = visibleModels.find((model) => model === value);
  const groups = groupModelsByVendor(
    visibleModels.filter((model) => model !== current),
  );
  const resetScroll = () => {
    if (listRef.current) listRef.current.scrollTop = 0;
  };
  const renderModel = (model: string, showVendor = false) => {
    const meta = modelMeta?.[model];
    const details = [
      showVendor ? modelVendorOf(model).label : null,
      meta?.groups != null
        ? dt("{{count}} 个可用分组", { count: meta.groups })
        : null,
      meta?.reasoningLevels != null
        ? dt("{{count}} 档推理等级", { count: meta.reasoningLevels })
        : null,
    ].filter(Boolean);
    return (
      <CommandItem
        key={model}
        value={model}
        disabled={meta?.available === false}
        className="mx-1 gap-2 rounded-lg px-2 py-2.5"
        onSelect={() => {
          if (!disabled && meta?.available !== false) {
            onChange(model);
            setOpen(false);
          }
        }}
      >
        <Check
          aria-hidden
          className={cn(
            "shrink-0 text-primary",
            value === model ? "opacity-100" : "opacity-0",
          )}
        />
        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-[12px] font-medium"
            title={model}
          >
            {model}
          </span>
          {details.length > 0 && (
            <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
              {details.join(" · ")}
            </span>
          )}
        </span>
        <span className="flex shrink-0 gap-1">
          {model === value && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
              {dt("当前")}
            </span>
          )}
          {model === recommended && (
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-700 dark:text-emerald-400">
              {dt("推荐")}
            </span>
          )}
        </span>
      </CommandItem>
    );
  };

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setSearch("");
          setVendorFilter("all");
          onRefresh?.();
        }
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
        className="z-[1000] w-[max(360px,var(--radix-popover-trigger-width))] max-w-[calc(100vw-24px)] overflow-hidden p-0"
        onClick={(event) => event.stopPropagation()}
      >
        <Command
          shouldFilter={false}
          className="max-h-[min(520px,var(--radix-popover-content-available-height))]"
        >
          <div className="shrink-0 border-b bg-popover">
            <CommandInput
              ref={inputRef}
              placeholder={dt("搜索模型名称或厂商…")}
              value={search}
              onValueChange={(next) => {
                setSearch(next);
                resetScroll();
              }}
            />
            <div
              role="group"
              aria-label={dt("按厂商筛选")}
              className="flex gap-1 overflow-x-auto px-3 py-2"
            >
              {[{ id: "all", label: dt("全部") }, ...vendors].map((vendor) => (
                <button
                  key={vendor.id}
                  type="button"
                  aria-pressed={activeVendor === vendor.id}
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    activeVendor === vendor.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted",
                  )}
                  onClick={() => {
                    setVendorFilter(vendor.id);
                    resetScroll();
                    inputRef.current?.focus();
                  }}
                >
                  {vendor.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between px-3 pb-2 text-[10px] text-muted-foreground">
              <span>
                {dt("显示 {{visible}} / {{total}} 个模型", {
                  visible: visibleModels.length,
                  total: orderedModels.length,
                })}
              </span>
              {(search || activeVendor !== "all") && (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => {
                    setSearch("");
                    setVendorFilter("all");
                    resetScroll();
                    inputRef.current?.focus();
                  }}
                >
                  {dt("清除筛选")}
                </button>
              )}
            </div>
          </div>
          <CommandList
            ref={listRef}
            className="min-h-0 max-h-[360px] flex-1 overscroll-contain p-1"
          >
            {visibleModels.length === 0 && (
              <div
                role="status"
                className="px-4 py-8 text-center text-xs text-muted-foreground"
              >
                {dt("没有找到匹配的模型")}
              </div>
            )}
            {current && (
              <CommandGroup
                heading={dt("当前使用")}
                className="mb-1 rounded-lg bg-primary/[0.035]"
              >
                {renderModel(current, true)}
              </CommandGroup>
            )}
            {groups.map((group) => (
              <CommandGroup
                key={group.id}
                heading={`${group.label} · ${group.models.length}`}
                className="border-t first:border-t-0"
              >
                {sortModelNames(group.models, [recommended]).map((model) =>
                  renderModel(model),
                )}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
