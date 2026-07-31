import {
  Activity,
  Blocks,
  Bot,
  CreditCard,
  Gauge,
  Globe,
  Network,
  RefreshCw,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import type { AppId } from "@/lib/api";
import { settingsApi } from "@/lib/api";
import type { VisibleApps } from "@/types";
import { APP_ICON_MAP } from "@/config/appConfig";
import { YUANHENG_WEBSITE_URL } from "@/config/yuanhengBrand";
import { useYuanhengTopup } from "@/hooks/useYuanhengTopup";
import { ProviderIcon } from "@/components/ProviderIcon";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { DesktopView } from "./types";

interface GlobalCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeApp: AppId;
  visibleApps: VisibleApps;
  onNavigate: (view: DesktopView) => void;
  onSetActiveApp: (app: AppId) => void;
}

const pages: Array<{
  view: DesktopView;
  label: string;
  description: string;
  icon: typeof Gauge;
}> = [
  { view: "home", label: "工作台", description: "返回首页", icon: Gauge },
  {
    view: "tools",
    label: "工具管理",
    description: "切换模型与分组",
    icon: Bot,
  },
  {
    view: "capabilities",
    label: "能力中心",
    description: "Skills、MCP 与提示词",
    icon: Blocks,
  },
  {
    view: "usage",
    label: "会话与用量",
    description: "查看请求与成本",
    icon: Activity,
  },
  {
    view: "network",
    label: "连接与路由",
    description: "账号连接与本地代理",
    icon: Network,
  },
  { view: "settings", label: "设置", description: "应用偏好", icon: Settings },
];

function appProviderIcon(app: AppId): string {
  if (app === "codex") return "openai";
  if (app === "claude-desktop") return "claude";
  return app;
}

export function GlobalCommandPalette({
  open,
  onOpenChange,
  activeApp,
  visibleApps,
  onNavigate,
  onSetActiveApp,
}: GlobalCommandPaletteProps) {
  const { openTopup } = useYuanhengTopup();

  const run = (action: () => unknown | Promise<unknown>) => {
    onOpenChange(false);
    void Promise.resolve(action()).catch((error) => {
      console.error("[GlobalCommandPalette] Command failed", error);
      toast.error("操作失败，请稍后重试");
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        zIndex="top"
        className="max-w-[620px] overflow-hidden rounded-2xl p-0"
      >
        <DialogTitle className="sr-only">快捷操作</DialogTitle>
        <Command className="rounded-none">
          <CommandInput
            autoFocus
            className="h-12"
            placeholder="搜索页面、工具或操作..."
          />
          <CommandList className="max-h-[430px] p-2">
            <CommandEmpty>没有找到匹配的操作</CommandEmpty>
            <CommandGroup heading="页面导航">
              {pages.map(({ view, label, description, icon: Icon }) => (
                <CommandItem
                  key={view}
                  value={`${label} ${description}`}
                  onSelect={() => run(() => onNavigate(view))}
                  className="rounded-lg px-3 py-2.5"
                >
                  <Icon className="text-muted-foreground" />
                  <span className="flex-1">
                    <span className="block text-xs font-medium">{label}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {description}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="切换当前工具">
              {(Object.keys(APP_ICON_MAP) as AppId[])
                .filter((app) => visibleApps[app] !== false)
                .map((app) => (
                  <CommandItem
                    key={app}
                    value={`切换工具 ${APP_ICON_MAP[app].label}`}
                    onSelect={() => run(() => onSetActiveApp(app))}
                    className="rounded-lg px-3 py-2.5"
                  >
                    <ProviderIcon
                      icon={appProviderIcon(app)}
                      name={APP_ICON_MAP[app].label}
                      size={16}
                    />
                    <span className="flex-1 text-xs">
                      {APP_ICON_MAP[app].label}
                    </span>
                    {activeApp === app && (
                      <span className="text-[10px] font-medium text-primary">
                        当前
                      </span>
                    )}
                  </CommandItem>
                ))}
            </CommandGroup>
            <CommandGroup heading="快捷操作">
              <CommandItem
                value="充值 余额 topup"
                onSelect={() => run(openTopup)}
                className="rounded-lg px-3 py-2.5"
              >
                <CreditCard />
                <span className="text-xs">充值账户余额</span>
              </CommandItem>
              <CommandItem
                value="官网 website"
                onSelect={() =>
                  run(() => settingsApi.openExternal(YUANHENG_WEBSITE_URL))
                }
                className="rounded-lg px-3 py-2.5"
              >
                <Globe />
                <span className="text-xs">访问元衡官网</span>
              </CommandItem>
              <CommandItem
                value="检查更新 update"
                onSelect={() => run(() => settingsApi.checkUpdates())}
                className="rounded-lg px-3 py-2.5"
              >
                <RefreshCw />
                <span className="text-xs">检查客户端更新</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
          <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-2 text-[10px] text-muted-foreground">
            <span>↑↓ 选择 · Enter 执行 · Esc 关闭</span>
            <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono">
              ⌘K
            </kbd>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
