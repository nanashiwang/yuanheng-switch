import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  FolderKanban,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Profile } from "@/lib/api/profiles";
import type { AppId } from "@/lib/api";
import { profilesApi, settingsApi } from "@/lib/api";
import { APP_PROFILE_SCOPE } from "@/components/profiles/scope";
import { APP_ICON_MAP } from "@/config/appConfig";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { extractErrorMessage } from "@/utils/errorUtils";
import { cn } from "@/lib/utils";
import { PageHeader } from "./PageHeader";

interface ProjectsPageProps {
  profiles: Profile[];
  selectedId: string | null;
  createSignal: number;
  onSelect: (id: string, preferredApp?: AppId) => void;
  onLaunch: (profileId: string, tool?: AppId) => void;
}

const PROJECT_TOOLS: AppId[] = [
  "claude",
  "codex",
  "gemini",
  "grokbuild",
  "opencode",
  "openclaw",
  "hermes",
];

const pathName = (path: string) =>
  path.split(/[\\/]/).filter(Boolean).pop() || "新项目";

export function ProjectsPage({
  profiles,
  selectedId,
  createSignal,
  onSelect,
  onLaunch,
}: ProjectsPageProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [directory, setDirectory] = useState("");
  const [name, setName] = useState("");
  const [defaultTool, setDefaultTool] = useState<AppId>("claude");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleting, setDeleting] = useState<Profile | null>(null);

  useEffect(() => {
    if (createSignal > 0) setCreateOpen(true);
  }, [createSignal]);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["profiles"] });

  const chooseDirectory = async (current?: string) => {
    const selected = await settingsApi.pickDirectory(current);
    if (!selected) return null;
    return selected;
  };

  const handleChooseNewDirectory = async () => {
    const selected = await chooseDirectory(directory);
    if (!selected) return;
    setDirectory(selected);
    if (!name.trim()) setName(pathName(selected));
  };

  const handleCreate = async () => {
    if (!name.trim() || !directory) return;
    setSaving(true);
    let createdId: string | null = null;
    try {
      const scope = APP_PROFILE_SCOPE[defaultTool] ?? "claude";
      const created = await profilesApi.create(name.trim(), scope);
      createdId = created.id;
      const project = await profilesApi.updateWorkspace(created.id, {
        directory,
        defaultTool,
      });
      await refresh();
      onSelect(project.id, defaultTool);
      setCreateOpen(false);
      setDirectory("");
      setName("");
      setDefaultTool("claude");
      toast.success("项目已创建并绑定目录");
    } catch (error) {
      if (createdId) {
        await profilesApi.delete(createdId).catch(() => undefined);
        await refresh();
      }
      toast.error(extractErrorMessage(error) || "创建项目失败");
    } finally {
      setSaving(false);
    }
  };

  const updateWorkspace = async (
    profile: Profile,
    updates: { directory?: string | null; defaultTool?: AppId | null },
  ) => {
    try {
      await profilesApi.updateWorkspace(profile.id, {
        directory: updates.directory ?? profile.payload.project.directory,
        defaultTool: updates.defaultTool ?? profile.payload.project.defaultTool,
      });
      await refresh();
      toast.success("项目设置已更新");
    } catch (error) {
      toast.error(extractErrorMessage(error) || "更新项目失败");
    }
  };

  const handleChangeDirectory = async (profile: Profile) => {
    const selected = await chooseDirectory(
      profile.payload.project.directory ?? undefined,
    );
    if (selected) await updateWorkspace(profile, { directory: selected });
  };

  const handleRename = async () => {
    if (!editing || !editingName.trim()) return;
    try {
      await profilesApi.update(editing.id, { name: editingName.trim() });
      await refresh();
      setEditing(null);
      toast.success("项目名称已更新");
    } catch (error) {
      toast.error(extractErrorMessage(error) || "重命名失败");
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await profilesApi.delete(deleting.id);
      await refresh();
      setDeleting(null);
      toast.success("项目已删除，本地目录未受影响");
    } catch (error) {
      toast.error(extractErrorMessage(error) || "删除项目失败");
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1120px] flex-col overflow-hidden px-7 pt-6">
      <PageHeader
        eyebrow="Project Context"
        title="项目"
        description="用项目统一组织本地目录、默认工具和能力快照。"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> 新建项目
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        {profiles.length === 0 ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex min-h-72 w-full flex-col items-center justify-center rounded-2xl border border-dashed bg-card/60 p-8 text-center transition-colors hover:border-primary/40"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FolderKanban className="h-6 w-6" />
            </span>
            <h2 className="font-display mt-4 text-lg font-semibold">
              创建第一个项目
            </h2>
            <p className="mt-1 max-w-md text-[12px] leading-5 text-muted-foreground">
              选择本地目录和默认 AI 工具，元衡会保存该项目的 Skills、MCP
              与提示词快照。
            </p>
          </button>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {profiles.map((profile, index) => {
              const tool = profile.payload.project.defaultTool ?? "claude";
              const isSelected = selectedId === profile.id;
              return (
                <article
                  key={profile.id}
                  className={cn(
                    "animate-rise-in rounded-2xl border bg-card p-5 shadow-sm transition-colors",
                    isSelected && "border-primary/35 ring-1 ring-primary/10",
                  )}
                  style={{ animationDelay: `${Math.min(index, 5) * 45}ms` }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/[0.08] text-primary">
                      <FolderKanban className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate font-display text-base font-semibold">
                          {profile.name}
                        </h2>
                        {isSelected && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold text-primary">
                            <CheckCircle2 className="h-3 w-3" /> 当前
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                        {profile.payload.project.directory ?? "尚未绑定目录"}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`${profile.name} 项目操作`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(profile);
                            setEditingName(profile.name);
                          }}
                        >
                          <Pencil className="h-4 w-4" /> 重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => void handleChangeDirectory(profile)}
                        >
                          <FolderOpen className="h-4 w-4" /> 更换目录
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleting(profile)}
                        >
                          <Trash2 className="h-4 w-4" /> 删除项目
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-5 grid grid-cols-[1fr_auto] items-end gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        默认工具
                      </Label>
                      <Select
                        value={tool}
                        onValueChange={(value) =>
                          void updateWorkspace(profile, {
                            defaultTool: value as AppId,
                          })
                        }
                      >
                        <SelectTrigger className="h-9 bg-background/60 text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PROJECT_TOOLS.map((id) => (
                            <SelectItem key={id} value={id}>
                              <span className="flex items-center gap-2">
                                <ProviderIcon
                                  icon={id === "codex" ? "openai" : id}
                                  name={APP_ICON_MAP[id].label}
                                  size={14}
                                />
                                {APP_ICON_MAP[id].label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      className="h-9"
                      disabled={!profile.payload.project.directory}
                      onClick={() => {
                        onLaunch(profile.id, tool);
                      }}
                    >
                      <Play className="h-3.5 w-3.5 fill-current" /> 启动
                    </Button>
                  </div>

                  {!isSelected && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => onSelect(profile.id)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> 切换到此项目
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>
              绑定本地目录后，工具会始终从该目录启动。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 pb-2">
            <div className="space-y-1.5">
              <Label htmlFor="project-name">项目名称</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：元衡控制台"
              />
            </div>
            <div className="space-y-1.5">
              <Label>项目目录</Label>
              <Button
                variant="outline"
                className="w-full justify-start font-normal"
                onClick={() => void handleChooseNewDirectory()}
              >
                <FolderOpen className="h-4 w-4 text-primary" />
                <span className="truncate">
                  {directory || "选择本地项目目录"}
                </span>
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>默认 AI 工具</Label>
              <Select
                value={defaultTool}
                onValueChange={(value) => setDefaultTool(value as AppId)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TOOLS.map((tool) => (
                    <SelectItem key={tool} value={tool}>
                      {APP_ICON_MAP[tool].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!name.trim() || !directory || saving}
              onClick={() => void handleCreate()}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} 创建项目
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>重命名项目</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-2">
            <Input
              value={editingName}
              onChange={(event) => setEditingName(event.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button
              disabled={!editingName.trim()}
              onClick={() => void handleRename()}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        title="删除项目"
        message={`确定删除“${deleting?.name ?? ""}”吗？只删除元衡中的项目配置，不会删除本地目录。`}
        variant="destructive"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
