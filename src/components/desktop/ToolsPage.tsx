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
        eyebrow="Install & Maintenance"
        title="工具管理"
        description="安装、检测和修复本机 AI 工具；日常模型切换请在工作台完成。"
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
