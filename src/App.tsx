import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  FolderArchive,
  History,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import { toast } from "sonner";

import type { AppId, ProviderSwitchEvent } from "@/lib/api";
import { profilesApi, providersApi, settingsApi } from "@/lib/api";
import { useSettingsQuery } from "@/lib/query";
import { useProfilesQuery } from "@/lib/query/profiles";
import {
  APP_PROFILE_SCOPE,
  getCurrentProfileId,
} from "@/components/profiles/scope";
import type { ProfileScope } from "@/lib/api/profiles";
import { checkAllEnvConflicts } from "@/lib/api/env";
import type { EnvConflict } from "@/types/env";
import type { VisibleApps } from "@/types";
import { extractErrorMessage } from "@/utils/errorUtils";
import { isTextEditableTarget } from "@/utils/domUtils";
import {
  DRAG_REGION_ATTR,
  DRAG_REGION_STYLE,
  isLinux,
  isWindows,
} from "@/lib/platform";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { useUsageCacheBridge } from "@/hooks/useUsageCacheBridge";
import { useProxyStatus } from "@/hooks/useProxyStatus";
import { useScanUnmanagedSkills } from "@/hooks/useSkills";

import { Button } from "@/components/ui/button";
import { UpdateBadge } from "@/components/UpdateBadge";
import { ModeToggle } from "@/components/mode-toggle";
import { EnvWarningBanner } from "@/components/env/EnvWarningBanner";
import { DeepLinkImportDialog } from "@/components/DeepLinkImportDialog";
import { SettingsPage } from "@/components/settings/SettingsPage";
import UnifiedMcpPanel from "@/components/mcp/UnifiedMcpPanel";
import PromptPanel from "@/components/prompts/PromptPanel";
import UnifiedSkillsPanel from "@/components/skills/UnifiedSkillsPanel";
import {
  SkillsPage,
  getSkillsPageHeaderActions,
  type SkillsPageSource,
} from "@/components/skills/SkillsPage";
import { AgentsPanel } from "@/components/agents/AgentsPanel";
import WorkspaceFilesPanel from "@/components/workspace/WorkspaceFilesPanel";
import EnvPanel from "@/components/openclaw/EnvPanel";
import ToolsPanel from "@/components/openclaw/ToolsPanel";
import AgentsDefaultsPanel from "@/components/openclaw/AgentsDefaultsPanel";
import HermesMemoryPanel from "@/components/hermes/HermesMemoryPanel";

import { DesktopSidebar } from "@/components/desktop/DesktopSidebar";
import { ProjectSelector } from "@/components/desktop/ProjectSelector";
import { WorkspaceDashboard } from "@/components/desktop/WorkspaceDashboard";
import { ProjectsPage } from "@/components/desktop/ProjectsPage";
import { ToolsPage } from "@/components/desktop/ToolsPage";
import { CapabilityCenter } from "@/components/desktop/CapabilityCenter";
import { UsageCenter } from "@/components/desktop/UsageCenter";
import { ConnectionCenter } from "@/components/desktop/ConnectionCenter";
import { OnboardingWizard } from "@/components/desktop/OnboardingWizard";
import type { DesktopView } from "@/components/desktop/types";
import { useYuanhengConnection } from "@/lib/query/yuanheng";
import { APP_ICON_MAP } from "@/config/appConfig";
import { ProviderIcon } from "@/components/ProviderIcon";

const DEFAULT_DRAG_BAR_HEIGHT = isWindows() || isLinux() ? 0 : 28;
const VIEW_KEY = "yuanheng-desktop-last-view";
const APP_KEY = "yuanheng-switch-last-app";
const PROJECT_KEY = "yuanheng-desktop-current-project";
const IS_TAURI_RUNTIME =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface SyncStatusUpdatedPayload {
  source?: string;
  status?: string;
  error?: string;
}

interface ProfileAppliedEvent {
  profileId: string | null;
  scope: ProfileScope;
}

const ALL_APPS: AppId[] = [
  "claude",
  "claude-desktop",
  "codex",
  "gemini",
  "grokbuild",
  "opencode",
  "openclaw",
  "hermes",
];

const TOP_LEVEL_VIEWS: DesktopView[] = [
  "home",
  "projects",
  "tools",
  "capabilities",
  "usage",
  "network",
  "settings",
];

function getInitialApp(): AppId {
  const saved = localStorage.getItem(APP_KEY) as AppId | null;
  return saved && ALL_APPS.includes(saved) ? saved : "claude";
}

function getInitialView(): DesktopView {
  const saved = localStorage.getItem(VIEW_KEY) as DesktopView | null;
  return saved && TOP_LEVEL_VIEWS.includes(saved) ? saved : "home";
}

interface DetailFrameProps {
  title: string;
  description: string;
  onBack: () => void;
  actions?: ReactNode;
  children: ReactNode;
}

function DetailFrame({
  title,
  description,
  onBack,
  actions,
  children,
}: DetailFrameProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-7 pt-5">
      <div className="flex shrink-0 items-start gap-3 pb-4">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          aria-label="返回能力中心"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {description}
          </p>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border bg-card/45">
        {children}
      </div>
    </div>
  );
}

function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [view, setView] = useState<DesktopView>(getInitialView);
  const [activeApp, setActiveAppState] = useState<AppId>(getInitialApp);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    () => localStorage.getItem(PROJECT_KEY),
  );
  const [projectCreateSignal, setProjectCreateSignal] = useState(0);
  const [settingsDefaultTab, setSettingsDefaultTab] = useState("general");
  const [skillsDiscoverySource, setSkillsDiscoverySource] =
    useState<SkillsPageSource>("repos");
  const [envConflicts, setEnvConflicts] = useState<EnvConflict[]>([]);
  const [showEnvBanner, setShowEnvBanner] = useState(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  const promptPanelRef = useRef<any>(null);
  const mcpPanelRef = useRef<any>(null);
  const skillsPageRef = useRef<any>(null);
  const unifiedSkillsPanelRef = useRef<any>(null);

  const { data: settingsData } = useSettingsQuery();
  const { data: profilesData } = useProfilesQuery();
  const { data: yuanhengConnection } = useYuanhengConnection();
  const activeProjectByScope = useRef<
    Partial<Record<ProfileScope, string | null>>
  >({});
  const projectScopeTasks = useRef<
    Partial<Record<ProfileScope, Promise<void>>>
  >({});
  const { data: unmanagedSkills } = useScanUnmanagedSkills();
  const hasUnmanagedSkills = (unmanagedSkills?.length ?? 0) > 0;
  const { isRunning: isProxyRunning } = useProxyStatus();

  useUsageCacheBridge();

  const profiles = profilesData?.profiles ?? [];
  const selectedProject = profiles.find(
    (profile) => profile.id === selectedProjectId,
  );
  const visibleApps: VisibleApps = settingsData?.visibleApps ?? {
    claude: true,
    "claude-desktop": true,
    codex: true,
    gemini: true,
    grokbuild: true,
    opencode: true,
    openclaw: true,
    hermes: true,
  };
  const useAppWindowControls =
    isLinux() && (settingsData?.useAppWindowControls ?? false);
  const dragBarHeight = useAppWindowControls ? 32 : DEFAULT_DRAG_BAR_HEIGHT;

  const persistActiveApp = (app: AppId) => {
    setActiveAppState(app);
    localStorage.setItem(APP_KEY, app);
  };

  const navigate = (next: DesktopView) => {
    setView(next);
    if (TOP_LEVEL_VIEWS.includes(next)) localStorage.setItem(VIEW_KEY, next);
  };

  useEffect(() => {
    if (!profilesData) return;
    if (
      selectedProjectId &&
      profiles.some((profile) => profile.id === selectedProjectId)
    )
      return;
    const fallbackId =
      profilesData.currentIds.claude ??
      profilesData.currentIds.codex ??
      profilesData.currentIds.claudeDesktop ??
      profilesData.currentIds.gemini ??
      profilesData.currentIds.grokbuild ??
      profilesData.currentIds.opencode ??
      profilesData.currentIds.openclaw ??
      profilesData.currentIds.hermes ??
      profiles[0]?.id ??
      null;
    setSelectedProjectId(fallbackId);
    if (fallbackId) localStorage.setItem(PROJECT_KEY, fallbackId);
    else localStorage.removeItem(PROJECT_KEY);
  }, [profiles, profilesData, selectedProjectId]);

  useEffect(() => {
    if (!profilesData) return;
    for (const app of ALL_APPS) {
      const scope = APP_PROFILE_SCOPE[app];
      if (scope) {
        activeProjectByScope.current[scope] = getCurrentProfileId(
          profilesData.currentIds,
          app,
        );
      }
    }
  }, [profilesData]);

  useEffect(() => {
    if (visibleApps[activeApp] !== false) return;
    const fallback =
      ALL_APPS.find((app) => visibleApps[app] !== false) ?? "claude";
    persistActiveApp(fallback);
  }, [activeApp, visibleApps]);

  const ensureProjectScope = async (id: string, app: AppId) => {
    const scope = APP_PROFILE_SCOPE[app];
    if (!scope) return;
    const previousTask = projectScopeTasks.current[scope] ?? Promise.resolve();
    const task = previousTask
      .catch(() => undefined)
      .then(async () => {
        const hasKnownCurrent = Object.prototype.hasOwnProperty.call(
          activeProjectByScope.current,
          scope,
        );
        const knownCurrent = hasKnownCurrent
          ? activeProjectByScope.current[scope]
          : getCurrentProfileId(profilesData?.currentIds, app);
        if (knownCurrent === id) return;

        const warnings = await profilesApi.apply(id, scope);
        activeProjectByScope.current[scope] = id;
        await queryClient.invalidateQueries({ queryKey: ["profiles"] });
        if (warnings.length > 0) {
          toast.warning("项目已切换，但部分配置未完全应用", {
            description: warnings.join("\n"),
            duration: 10000,
          });
        }
      });
    projectScopeTasks.current[scope] = task;
    try {
      await task;
    } finally {
      if (projectScopeTasks.current[scope] === task) {
        delete projectScopeTasks.current[scope];
      }
    }
  };

  const handleSetActiveProjectApp = (app: AppId) => {
    persistActiveApp(app);
    if (!selectedProjectId) return;
    void ensureProjectScope(selectedProjectId, app).catch((error) => {
      toast.error(extractErrorMessage(error) || "项目上下文切换失败");
    });
  };

  const handleSelectProject = (id: string, preferredApp?: AppId) => {
    setSelectedProjectId(id);
    localStorage.setItem(PROJECT_KEY, id);
    const project = profiles.find((item) => item.id === id);
    const tool = preferredApp ?? project?.payload.project.defaultTool;
    const app = tool ?? activeApp;
    if (tool) persistActiveApp(tool);
    void ensureProjectScope(id, app).catch((error) => {
      toast.error(extractErrorMessage(error) || "项目切换失败");
    });
  };

  const handleLaunchProject = async (tool?: AppId, profileId?: string) => {
    const id = profileId ?? selectedProjectId;
    if (!id) {
      navigate("projects");
      setProjectCreateSignal((value) => value + 1);
      return;
    }
    const project = profiles.find((item) => item.id === id);
    const launchTool =
      tool ?? project?.payload.project.defaultTool ?? activeApp;
    persistActiveApp(launchTool);
    try {
      if (id !== selectedProjectId) {
        setSelectedProjectId(id);
        localStorage.setItem(PROJECT_KEY, id);
      }
      await ensureProjectScope(id, launchTool);
      await profilesApi.launch(id, launchTool);
      toast.success(`${APP_ICON_MAP[launchTool].label} 已在项目目录启动`);
    } catch (error) {
      toast.error(extractErrorMessage(error) || "项目启动失败");
    }
  };

  const handleCreateProject = () => {
    navigate("projects");
    setProjectCreateSignal((value) => value + 1);
  };

  const saveSettingsPatch = async (updates: Record<string, unknown>) => {
    if (!settingsData) return false;
    const next = { ...settingsData, ...updates };
    const webdavSync = next.webdavSync;
    void webdavSync;
    const { webdavSync: _removed, ...payload } = next;
    void _removed;
    await settingsApi.save(payload);
    await queryClient.invalidateQueries({ queryKey: ["settings"] });
    return true;
  };

  const finishOnboarding = () => {
    void saveSettingsPatch({ firstRunNoticeConfirmed: true }).catch((error) => {
      console.error("Failed to save onboarding state", error);
    });
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;
    void providersApi
      .onSwitched(async (event: ProviderSwitchEvent) => {
        await queryClient.invalidateQueries({
          queryKey: ["providers", event.appType],
        });
        await queryClient.invalidateQueries({
          queryKey: ["desktop", "tool-connections"],
        });
      })
      .then((off) => {
        if (active) unsubscribe = off;
        else off();
      })
      .catch((error) =>
        console.error("Failed to subscribe provider switch", error),
      );
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [queryClient]);

  useTauriEvent<ProfileAppliedEvent>("profile-applied", async (event) => {
    activeProjectByScope.current[event.scope] = event.profileId;
    setSelectedProjectId(event.profileId);
    if (event.profileId) localStorage.setItem(PROJECT_KEY, event.profileId);
    else localStorage.removeItem(PROJECT_KEY);
    await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    await queryClient.invalidateQueries({ queryKey: ["mcp", "all"] });
    await queryClient.invalidateQueries({ queryKey: ["skills"] });
    await queryClient.invalidateQueries({ queryKey: ["proxyStatus"] });
  });

  useTauriEvent<SyncStatusUpdatedPayload | null | undefined>(
    "webdav-sync-status-updated",
    async (payload) => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      if (payload?.source === "auto" && payload.status === "error") {
        toast.error(`WebDAV 自动同步失败：${payload.error || "未知错误"}`);
      }
    },
  );

  useTauriEvent<SyncStatusUpdatedPayload | null | undefined>(
    "s3-sync-status-updated",
    async (payload) => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      if (payload?.source === "auto" && payload.status === "error") {
        toast.error(`S3 自动同步失败：${payload.error || "未知错误"}`);
      }
    },
  );

  useEffect(() => {
    const checkEnvironment = async () => {
      try {
        const all = await checkAllEnvConflicts();
        const conflicts = Object.values(all).flat();
        setEnvConflicts(conflicts);
        if (
          conflicts.length > 0 &&
          !sessionStorage.getItem("env_banner_dismissed")
        ) {
          setShowEnvBanner(true);
        }
      } catch (error) {
        console.error("Failed to check environment conflicts", error);
      }
    };
    void checkEnvironment();
  }, []);

  useEffect(() => {
    void invoke<boolean>("get_migration_result")
      .then((migrated) => migrated && toast.success("配置迁移成功"))
      .catch((error) =>
        console.error("Failed to read migration result", error),
      );
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "," && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        navigate("settings");
        return;
      }
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !isTextEditableTarget(event.target) &&
        !TOP_LEVEL_VIEWS.includes(view)
      ) {
        event.preventDefault();
        navigate("capabilities");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view]);

  useEffect(() => {
    if (!IS_TAURI_RUNTIME) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    const sync = async () => {
      try {
        const window = getCurrentWindow();
        const update = async () => {
          const maximized = await window.isMaximized();
          if (active) setIsWindowMaximized(maximized);
        };
        await update();
        unlisten = await window.onResized(() => void update());
      } catch (error) {
        console.error("Failed to sync window state", error);
      }
    };
    void sync();
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!settingsData || !IS_TAURI_RUNTIME) return;
    try {
      void getCurrentWindow()
        .setDecorations(!useAppWindowControls)
        .catch((error) =>
          console.error("Failed to update window decorations", error),
        );
    } catch (error) {
      console.debug("Window decorations unavailable", error);
    }
  }, [settingsData, useAppWindowControls]);

  const windowAction = async (action: "minimize" | "maximize" | "close") => {
    try {
      const window = getCurrentWindow();
      if (action === "minimize") await window.minimize();
      if (action === "maximize") {
        await window.toggleMaximize();
        setIsWindowMaximized(await window.isMaximized());
      }
      if (action === "close") await window.close();
    } catch (error) {
      toast.error(`窗口操作失败：${extractErrorMessage(error)}`);
    }
  };

  const renderContent = () => {
    switch (view) {
      case "home":
        return (
          <WorkspaceDashboard
            project={selectedProject}
            activeApp={activeApp}
            onNavigate={navigate}
            onLaunch={(tool) => void handleLaunchProject(tool)}
          />
        );
      case "projects":
        return (
          <ProjectsPage
            profiles={profiles}
            selectedId={selectedProjectId}
            createSignal={projectCreateSignal}
            onSelect={handleSelectProject}
            onLaunch={(profileId, tool) =>
              void handleLaunchProject(tool, profileId)
            }
          />
        );
      case "tools":
        return (
          <ToolsPage
            project={selectedProject}
            activeApp={activeApp}
            visibleApps={visibleApps}
            onSetActiveApp={handleSetActiveProjectApp}
            onLaunch={(tool) => void handleLaunchProject(tool)}
            onNavigate={navigate}
          />
        );
      case "capabilities":
        return (
          <CapabilityCenter
            project={selectedProject}
            activeApp={activeApp}
            onOpen={navigate}
          />
        );
      case "usage":
        return (
          <UsageCenter
            activeApp={activeApp}
            onSetActiveApp={persistActiveApp}
            refreshIntervalMs={settingsData?.usageDashboardRefreshIntervalMs}
            onRefreshIntervalChange={(usageDashboardRefreshIntervalMs) =>
              saveSettingsPatch({ usageDashboardRefreshIntervalMs })
            }
          />
        );
      case "network":
        return <ConnectionCenter />;
      case "settings":
        return (
          <div className="h-full pt-5">
            <SettingsPage
              open
              onOpenChange={() => navigate("home")}
              defaultTab={settingsDefaultTab}
              onImportSuccess={() => queryClient.invalidateQueries()}
            />
          </div>
        );
      case "skills":
        return (
          <DetailFrame
            title="Skills"
            description="安装、启用并同步项目需要的专业能力。"
            onBack={() => navigate("capabilities")}
            actions={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    unifiedSkillsPanelRef.current?.openRestoreFromBackup()
                  }
                >
                  <History className="h-3.5 w-3.5" /> 恢复
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    unifiedSkillsPanelRef.current?.openInstallFromZip()
                  }
                >
                  <FolderArchive className="h-3.5 w-3.5" /> ZIP
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="relative"
                  onClick={() => unifiedSkillsPanelRef.current?.openImport()}
                >
                  <Download className="h-3.5 w-3.5" /> 导入
                  {hasUnmanagedSkills && (
                    <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  )}
                </Button>
                <Button size="sm" onClick={() => navigate("skillsDiscovery")}>
                  <Search className="h-3.5 w-3.5" /> 发现
                </Button>
              </>
            }
          >
            <UnifiedSkillsPanel
              ref={unifiedSkillsPanelRef}
              onOpenDiscovery={() => navigate("skillsDiscovery")}
              currentApp={activeApp === "openclaw" ? "claude" : activeApp}
            />
          </DetailFrame>
        );
      case "skillsDiscovery":
        return (
          <DetailFrame
            title="发现 Skills"
            description="从可信仓库查找并安装项目能力。"
            onBack={() => navigate("skills")}
            actions={getSkillsPageHeaderActions(skillsDiscoverySource).map(
              ({ key, labelKey, Icon, execute }) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  onClick={() => execute(skillsPageRef.current)}
                >
                  <Icon className="h-3.5 w-3.5" /> {t(labelKey)}
                </Button>
              ),
            )}
          >
            <SkillsPage
              ref={skillsPageRef}
              initialApp={activeApp === "openclaw" ? "claude" : activeApp}
              onSourceChange={setSkillsDiscoverySource}
            />
          </DetailFrame>
        );
      case "mcp":
        return (
          <DetailFrame
            title="MCP"
            description="管理工具与本地或远程服务的连接。"
            onBack={() => navigate("capabilities")}
            actions={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => mcpPanelRef.current?.openImport()}
                >
                  <Download className="h-3.5 w-3.5" /> 导入已有配置
                </Button>
                <Button
                  size="sm"
                  onClick={() => mcpPanelRef.current?.openAdd()}
                >
                  <Plus className="h-3.5 w-3.5" /> 添加 MCP
                </Button>
              </>
            }
          >
            <UnifiedMcpPanel
              ref={mcpPanelRef}
              onOpenChange={() => navigate("capabilities")}
            />
          </DetailFrame>
        );
      case "prompts":
        return (
          <DetailFrame
            title="Prompts"
            description={`管理 ${APP_ICON_MAP[activeApp].label} 的项目提示词。`}
            onBack={() => navigate("capabilities")}
            actions={
              <Button
                size="sm"
                onClick={() => promptPanelRef.current?.openAdd()}
              >
                <Plus className="h-3.5 w-3.5" /> 添加提示词
              </Button>
            }
          >
            <PromptPanel
              ref={promptPanelRef}
              open
              onOpenChange={() => navigate("capabilities")}
              appId={activeApp === "claude-desktop" ? "claude" : activeApp}
            />
          </DetailFrame>
        );
      case "agents":
        return (
          <DetailFrame
            title="Agents"
            description="Agent 编排正在建设中，当前不展示尚未实现的配置。"
            onBack={() => navigate("capabilities")}
          >
            <AgentsPanel onOpenChange={() => navigate("capabilities")} />
          </DetailFrame>
        );
      case "workspace":
        return <WorkspaceFilesPanel />;
      case "openclawEnv":
        return <EnvPanel />;
      case "openclawTools":
        return <ToolsPanel />;
      case "openclawAgents":
        return <AgentsDefaultsPanel />;
      case "hermesMemory":
        return <HermesMemoryPanel />;
      default:
        return null;
    }
  };

  const forceOnboardingPreview =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).has("onboarding");
  const onboardingOpen =
    forceOnboardingPreview ||
    Boolean(settingsData && settingsData.firstRunNoticeConfirmed !== true);

  return (
    <div
      className="h-screen overflow-hidden bg-background text-foreground selection:bg-primary/20"
      style={{ paddingTop: dragBarHeight }}
    >
      {(dragBarHeight > 0 || useAppWindowControls) && (
        <div
          className="fixed left-0 right-0 top-0 z-[80] flex items-center justify-end bg-[#11191b] px-2"
          data-tauri-drag-region
          style={
            {
              WebkitAppRegion: "drag",
              height: dragBarHeight,
            } as React.CSSProperties
          }
        >
          {useAppWindowControls && (
            <div
              className="flex items-center gap-1"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-300"
                aria-label="最小化窗口"
                onClick={() => void windowAction("minimize")}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-300"
                aria-label={isWindowMaximized ? "还原窗口" : "最大化窗口"}
                onClick={() => void windowAction("maximize")}
              >
                {isWindowMaximized ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-300 hover:bg-red-500/20 hover:text-red-300"
                aria-label="关闭窗口"
                onClick={() => void windowAction("close")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex h-full min-h-0">
        <DesktopSidebar
          view={view}
          onNavigate={navigate}
          connected={Boolean(yuanhengConnection?.connected)}
          proxyRunning={isProxyRunning}
        />
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_92%_5%,hsl(var(--primary)/0.055),transparent_34%)]">
          <header
            className="flex h-[54px] shrink-0 items-center gap-3 border-b bg-background/85 px-5 backdrop-blur-md"
            {...DRAG_REGION_ATTR}
            style={{ ...DRAG_REGION_STYLE } as React.CSSProperties}
          >
            <div
              className="min-w-0 flex-1"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <ProjectSelector
                profiles={profiles}
                selectedId={selectedProjectId}
                onSelect={handleSelectProject}
                onCreate={handleCreateProject}
              />
            </div>
            <div
              className="flex items-center gap-1.5"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <div className="mr-1 hidden h-8 items-center gap-2 rounded-lg bg-muted/60 px-2.5 text-[11px] text-muted-foreground sm:flex">
                <ProviderIcon
                  icon={
                    activeApp === "codex"
                      ? "openai"
                      : activeApp === "claude-desktop"
                        ? "claude"
                        : activeApp
                  }
                  name={APP_ICON_MAP[activeApp].label}
                  size={14}
                />
                {APP_ICON_MAP[activeApp].label}
              </div>
              <ModeToggle />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setSettingsDefaultTab("general");
                  navigate("settings");
                }}
                title="设置"
              >
                <Settings className="h-4 w-4" />
              </Button>
              <UpdateBadge
                onClick={() => {
                  setSettingsDefaultTab("about");
                  navigate("settings");
                }}
              />
            </div>
          </header>

          {showEnvBanner && envConflicts.length > 0 && (
            <EnvWarningBanner
              conflicts={envConflicts}
              onDismiss={() => {
                setShowEnvBanner(false);
                sessionStorage.setItem("env_banner_dismissed", "true");
              }}
              onDeleted={async () => {
                const all = await checkAllEnvConflicts();
                const conflicts = Object.values(all).flat();
                setEnvConflicts(conflicts);
                if (conflicts.length === 0) setShowEnvBanner(false);
              }}
            />
          )}

          <main className="min-h-0 flex-1 overflow-hidden">
            {renderContent()}
          </main>
        </section>
      </div>

      <OnboardingWizard
        open={onboardingOpen}
        profiles={profiles}
        onFinish={finishOnboarding}
        onProjectCreated={(id, defaultTool) => {
          handleSelectProject(id, defaultTool);
        }}
      />
      <DeepLinkImportDialog />
    </div>
  );
}

export default App;
