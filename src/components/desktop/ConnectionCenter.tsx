import { Loader2, Network, Route, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { YuanhengConnectionPanel } from "./YuanhengConnectionPanel";
import { PageHeader } from "./PageHeader";
import { ProxyTabContent } from "@/components/settings/ProxyTabContent";
import { useSettings, type SettingsFormState } from "@/hooks/useSettings";

export function ConnectionCenter() {
  const { settings, isLoading, updateSettings, autoSaveSettings } =
    useSettings();

  const handleAutoSave = async (updates: Partial<SettingsFormState>) => {
    if (!settings) return false;
    updateSettings(updates);
    try {
      await autoSaveSettings(updates);
      return true;
    } catch {
      toast.error("路由设置保存失败");
      return false;
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1120px] flex-col overflow-hidden px-7 pt-6">
      <PageHeader
        eyebrow="Connection & Routing"
        title="连接与路由"
        description="元衡账号负责远程权限和模型目录，本地路由负责接管、健康检查与故障转移。"
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        <YuanhengConnectionPanel />

        <div className="mb-4 mt-6 flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Route className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold">
              本地路由与高可用
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              专业功能默认收起，普通使用无需调整。
            </p>
          </div>
          <div className="ml-auto hidden items-center gap-3 text-[10px] text-muted-foreground sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5" /> 本地接管
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> 自动故障转移
            </span>
          </div>
        </div>

        {isLoading && !settings ? (
          <div className="flex min-h-40 items-center justify-center rounded-2xl border bg-card">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : settings ? (
          <ProxyTabContent settings={settings} onAutoSave={handleAutoSave} />
        ) : null}
      </div>
    </div>
  );
}
