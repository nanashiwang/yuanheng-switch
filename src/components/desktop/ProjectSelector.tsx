import { Check, ChevronsUpDown, FolderKanban, Plus } from "lucide-react";
import type { Profile } from "@/lib/api/profiles";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ProjectSelectorProps {
  profiles: Profile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function ProjectSelector({
  profiles,
  selectedId,
  onSelect,
  onCreate,
}: ProjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const selected = profiles.find((profile) => profile.id === selectedId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 max-w-[320px] justify-start gap-2 border-border/70 bg-background/80 px-3 shadow-none"
          aria-label="选择当前项目"
        >
          <FolderKanban className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-left text-[13px]">
            {selected?.name ?? "选择当前项目"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-0">
        <Command>
          <CommandInput placeholder="查找项目..." />
          <CommandList>
            <CommandEmpty>没有找到项目</CommandEmpty>
            <CommandGroup heading="项目">
              {profiles.map((profile) => (
                <CommandItem
                  key={profile.id}
                  value={`${profile.name} ${profile.payload.project.directory ?? ""}`}
                  onSelect={() => {
                    onSelect(profile.id);
                    setOpen(false);
                  }}
                  className="gap-2.5 py-2"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <FolderKanban className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">
                      {profile.name}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {profile.payload.project.directory ?? "尚未绑定目录"}
                    </p>
                  </div>
                  <Check
                    className={cn(
                      "h-4 w-4 text-primary",
                      selectedId === profile.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
            <div className="border-t p-1.5">
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  onCreate();
                }}
                className="gap-2 text-primary"
              >
                <Plus className="h-4 w-4" />
                新建项目
              </CommandItem>
            </div>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
