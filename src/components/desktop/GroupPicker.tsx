import { useRef, useState } from "react";
import { Check, ChevronsUpDown, Star } from "lucide-react";
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
import type { CompactSelectPickerProps } from "./CompactSelectPicker";
import { useLocalPickerFavorites } from "./useModelFavorites";
import { dt } from "./desktopI18n";

export const GROUP_FAVORITES_KEY = "yuanheng:group-favorites:v1";
const GROUP_KINDS = ["groups"] as const;

/** Favorites only rank the caller's groups; they never grant access or apply config. */
export function GroupPicker({
  label,
  value,
  options,
  disabled,
  triggerClassName,
  contentClassName,
  itemClassName,
  onChange,
}: CompactSelectPickerProps) {
  const { favorites, toggle, saveFailed } = useLocalPickerFavorites(
    GROUP_FAVORITES_KEY,
    GROUP_KINDS,
  );
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const selected =
    options.find((option) => option.value === value) ??
    (value ? undefined : options[0]);
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = options.filter((option) =>
    terms.every((term) =>
      `${option.value} ${option.label}`.toLowerCase().includes(term),
    ),
  );
  // Stable rows preserve star-button focus when the list reorders.
  const ordered = [...visible].sort(
    (a, b) =>
      Number(favorites.groups.includes(b.value)) -
      Number(favorites.groups.includes(a.value)),
  );
  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          disabled={disabled || options.length === 0}
          className={cn(
            "flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-md border bg-background px-2 text-left text-[10px] shadow-sm disabled:opacity-50",
            triggerClassName,
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <span className="min-w-0 flex-1 truncate">
            {selected?.label ?? value}
          </span>
          <ChevronsUpDown
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 opacity-50"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className={cn(
          "z-[1000] w-[max(280px,var(--radix-popover-trigger-width))] max-w-[calc(100vw-24px)] overflow-hidden p-0",
          contentClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <Command
          shouldFilter={false}
          className="max-h-[min(400px,var(--radix-popover-content-available-height))]"
        >
          <div className="shrink-0 border-b">
            <CommandInput
              placeholder={dt("搜索令牌分组…")}
              value={search}
              onValueChange={(next) => {
                setSearch(next);
                if (listRef.current) listRef.current.scrollTop = 0;
              }}
            />
            <p className="px-3 py-2 text-[10px] text-muted-foreground">
              {dt("星标收藏置顶，仅在本机保存")}
            </p>
          </div>
          {saveFailed && (
            <p role="alert" className="px-3 py-2 text-xs text-destructive">
              {dt("无法保存收藏，请检查本地存储后重试")}
            </p>
          )}
          <CommandList
            ref={listRef}
            className="min-h-0 flex-1 overscroll-contain"
          >
            {ordered.length === 0 && (
              <p
                role="status"
                className="px-4 py-6 text-center text-xs text-muted-foreground"
              >
                {dt("没有找到匹配的分组")}
              </p>
            )}
            <CommandGroup>
              {ordered.map((option) => {
                const favorite = favorites.groups.includes(option.value);
                const action = dt(
                  favorite ? "取消收藏分组 {{name}}" : "收藏分组 {{name}}",
                  { name: option.value },
                );
                return (
                  <div key={option.value} className="flex items-center">
                    <CommandItem
                      value={`group:${option.value}`}
                      disabled={disabled}
                      className={cn(
                        "min-w-0 flex-1 text-[10.5px]",
                        itemClassName,
                      )}
                      onSelect={() => {
                        if (!disabled) {
                          onChange(option.value);
                          setOpen(false);
                        }
                      }}
                    >
                      <Check
                        aria-hidden
                        className={cn(
                          "shrink-0",
                          option.value === value ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span
                        className="min-w-0 flex-1 truncate"
                        title={option.label}
                      >
                        {option.label}
                      </span>
                    </CommandItem>
                    {option.value !== "" && (
                      <button
                        type="button"
                        aria-label={action}
                        title={action}
                        aria-pressed={favorite}
                        disabled={disabled}
                        className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ")
                            event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggle("groups", option.value);
                        }}
                      >
                        <Star
                          aria-hidden
                          className={cn(
                            "h-3.5 w-3.5",
                            favorite && "fill-amber-400 text-amber-600",
                          )}
                        />
                      </button>
                    )}
                  </div>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
