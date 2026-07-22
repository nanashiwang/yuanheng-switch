import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  FolderKanban,
  FolderOpen,
  Loader2,
  MonitorCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { Profile } from "@/lib/api/profiles";
import type { AppId } from "@/lib/api";
import { profilesApi, settingsApi } from "@/lib/api";
import { APP_PROFILE_SCOPE } from "@/components/profiles/scope";
import { APP_ICON_MAP } from "@/config/appConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { YuanhengConnectionPanel } from "./YuanhengConnectionPanel";
import { extractErrorMessage } from "@/utils/errorUtils";
import { cn } from "@/lib/utils";

interface OnboardingWizardProps {
  open: boolean;
  profiles: Profile[];
  onFinish: () => void;
  onProjectCreated: (id: string, defaultTool: AppId) => void;
}

const STEPS = [
  { label: "欢迎", icon: Sparkles },
  { label: "连接元衡", icon: Cloud },
  { label: "绑定项目", icon: FolderKanban },
  { label: "检查工具", icon: MonitorCheck },
];

const ONBOARDING_TOOLS: AppId[] = ["claude", "codex", "gemini", "opencode"];

export function OnboardingWizard({
  open,
  profiles,
  onFinish,
  onProjectCreated,
}: OnboardingWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [directory, setDirectory] = useState("");
  const [projectName, setProjectName] = useState("");
  const [defaultTool, setDefaultTool] = useState<AppId>("claude");
  const [savingProject, setSavingProject] = useState(false);
  const [toolVersions, setToolVersions] = useState<
    Awaited<ReturnType<typeof settingsApi.getToolVersions>>
  >([]);
  const [checkingTools, setCheckingTools] = useState(false);

  useEffect(() => {
    if (!open) setStep(0);
  }, [open]);

  useEffect(() => {
    if (step !== 3) return;
    setCheckingTools(true);
    void settingsApi
      .getToolVersions(["claude", "codex", "gemini", "opencode"])
      .then(setToolVersions)
      .finally(() => setCheckingTools(false));
  }, [step]);

  const chooseDirectory = async () => {
    const selected = await settingsApi.pickDirectory(directory || undefined);
    if (!selected) return;
    setDirectory(selected);
    if (!projectName.trim()) {
      setProjectName(selected.split(/[\\/]/).filter(Boolean).pop() || "新项目");
    }
  };

  const createProject = async () => {
    if (!directory || !projectName.trim()) return;
    setSavingProject(true);
    let createdId: string | null = null;
    try {
      const created = await profilesApi.create(
        projectName.trim(),
        APP_PROFILE_SCOPE[defaultTool] ?? "claude",
      );
      createdId = created.id;
      const project = await profilesApi.updateWorkspace(created.id, {
        directory,
        defaultTool,
      });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      onProjectCreated(project.id, defaultTool);
      toast.success("项目已绑定");
      setStep(3);
    } catch (error) {
      if (createdId) {
        await profilesApi.delete(createdId).catch(() => undefined);
        await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      }
      toast.error(extractErrorMessage(error) || "项目创建失败");
    } finally {
      setSavingProject(false);
    }
  };

  const finish = () => {
    onFinish();
    setStep(0);
  };

  const renderStep = () => {
    if (step === 0) {
      return (
        <div className="flex min-h-[330px] flex-col items-center justify-center px-8 text-center">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-[26px] bg-[#173f3a] text-[#e9b67c] shadow-lg">
            <Sparkles className="h-8 w-8" />
            <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full border-4 border-background bg-emerald-500" />
          </div>
          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            Yuanheng Desktop
          </p>
          <h2 className="font-display mt-2 text-3xl font-semibold tracking-[-0.04em]">
            让 AI 工具围绕项目工作
          </h2>
          <p className="mt-3 max-w-lg text-[13px] leading-6 text-muted-foreground">
            连接账号、绑定本地项目、同步能力配置，然后从同一个项目上下文启动所有
            AI 工具。
          </p>
        </div>
      );
    }

    if (step === 1) {
      return (
        <div className="min-h-[330px] px-6 py-2">
          <YuanhengConnectionPanel compact onConnected={() => setStep(2)} />
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            也可以暂时跳过，稍后在“连接与路由”中完成。
          </p>
        </div>
      );
    }

    if (step === 2) {
      if (profiles.length > 0) {
        return (
          <div className="flex min-h-[330px] flex-col items-center justify-center px-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
              <Check className="h-6 w-6" />
            </span>
            <h2 className="font-display mt-4 text-xl font-semibold">
              已发现 {profiles.length} 个项目
            </h2>
            <p className="mt-2 text-[12px] text-muted-foreground">
              现有项目配置会继续保留，可以直接进入下一步。
            </p>
          </div>
        );
      }
      return (
        <div className="mx-auto min-h-[330px] max-w-lg space-y-4 px-6 py-3">
          <div>
            <h2 className="font-display text-xl font-semibold">
              绑定第一个项目
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              工具将从这个目录启动，并自动关联能力快照。
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>项目名称</Label>
            <Input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="项目名称"
            />
          </div>
          <div className="space-y-1.5">
            <Label>本地目录</Label>
            <Button
              variant="outline"
              className="w-full justify-start font-normal"
              onClick={() => void chooseDirectory()}
            >
              <FolderOpen className="h-4 w-4 text-primary" />
              <span className="truncate">{directory || "选择项目目录"}</span>
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label>默认工具</Label>
            <Select
              value={defaultTool}
              onValueChange={(value) => setDefaultTool(value as AppId)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ONBOARDING_TOOLS.map((tool) => (
                  <SelectItem key={tool} value={tool}>
                    {APP_ICON_MAP[tool].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-[330px] px-8 py-3">
        <h2 className="font-display text-xl font-semibold">本机工具检查</h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          这里只检查安装状态，不会自动修改你的工具。
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {ONBOARDING_TOOLS.map((tool) => {
            const command = tool === "codex" ? "codex" : tool;
            const version = toolVersions.find((item) => item.name === command);
            return (
              <div
                key={tool}
                className="flex items-center gap-3 rounded-xl border bg-card p-3"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg",
                    version?.version
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {checkingTools ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : version?.version ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <MonitorCheck className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold">
                    {APP_ICON_MAP[tool].label}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {version?.version || "未检测到"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-5 rounded-xl bg-primary/[0.06] px-4 py-3 text-[11px] leading-5 text-muted-foreground">
          完成后可在“AI 工具”页面安装缺失工具，并从当前项目目录直接启动。
        </div>
      </div>
    );
  };

  const canContinue =
    step !== 2 ||
    profiles.length > 0 ||
    (Boolean(directory) && Boolean(projectName.trim()));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && finish()}>
      <DialogContent className="max-w-3xl overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>首次配置</DialogTitle>
          <DialogDescription>配置元衡账号、项目和本地工具</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 border-b bg-muted/35 px-6 py-3">
          {STEPS.map((item, index) => (
            <div
              key={item.label}
              className={cn(
                "flex items-center justify-center gap-1.5 text-[10px] font-medium",
                index === step
                  ? "text-primary"
                  : index < step
                    ? "text-foreground"
                    : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full",
                  index <= step ? "bg-primary/10" : "bg-muted",
                )}
              >
                {index < step ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <item.icon className="h-3 w-3" />
                )}
              </span>
              {item.label}
            </div>
          ))}
        </div>
        {renderStep()}
        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="ghost" onClick={finish}>
            稍后配置
          </Button>
          <div className="flex-1" />
          {step > 0 && (
            <Button
              variant="outline"
              onClick={() => setStep((value) => value - 1)}
            >
              <ChevronLeft className="h-4 w-4" /> 上一步
            </Button>
          )}
          {step < 3 ? (
            <Button
              disabled={!canContinue || savingProject}
              onClick={() => {
                if (step === 2 && profiles.length === 0) void createProject();
                else setStep((value) => value + 1);
              }}
            >
              {savingProject && <Loader2 className="h-4 w-4 animate-spin" />}
              {step === 2 && profiles.length === 0 ? "创建并继续" : "继续"}
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={finish}>
              <Check className="h-4 w-4" /> 进入工作台
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
