import type { AppId } from "@/lib/api";
import { PageHeader } from "./PageHeader";
import { ToolSetupGrid } from "./ToolSetupGrid";

interface ToolsPageProps {
  activeApp: AppId;
  visibleApps: Partial<Record<AppId, boolean>>;
  onSetActiveApp: (app: AppId) => void;
}

export function ToolsPage({
  activeApp,
  visibleApps,
  onSetActiveApp,
}: ToolsPageProps) {
  return (
    <div className="mx-auto flex h-full w-full max-w-[1120px] flex-col overflow-hidden px-7 pt-6">
      <PageHeader
        eyebrow="AI Tool Setup"
        title="AI 工具"
        description="选择需要使用的本机工具，一键写入元衡 API、认证和模型配置。"
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        <ToolSetupGrid
          activeApp={activeApp}
          visibleApps={visibleApps}
          onSetActiveApp={onSetActiveApp}
        />
      </div>
    </div>
  );
}
