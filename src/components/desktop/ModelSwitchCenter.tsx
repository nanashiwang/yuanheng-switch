import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProviderIcon } from "@/components/ProviderIcon";
import type { YuanhengReasoningLevel, YuanhengToolId } from "@/lib/api";
import { ModelPicker } from "./ModelPicker";
import { pickPreferredGroup, reasoningLabel, toolLabel } from "./ToolSetupGrid";
import {
  providerIconOf,
  type ModelSwitchCenterState,
} from "./useModelSwitchCenter";

const controlsReasoning = (app: YuanhengToolId) =>
  app === "claude-desktop" || app === "codex" || app === "chatgpt-desktop";

interface ModelSwitchCenterProps {
  switcher: ModelSwitchCenterState;
  onOpenTools: () => void;
}

export function ModelSwitchCenter({
  switcher,
  onOpenTools,
}: ModelSwitchCenterProps) {
  const {
    connection,
    bootstrapPhase,
    bootstrapRefreshing,
    retryBootstrap,
    rows,
    models,
    groups,
    reasoning,
    pendingApps,
    statusMap,
    codexBridge,
    refreshModels,
    applyModel,
    applyGroup,
    applyReasoning,
    launch,
  } = switcher;
  const groupMap = new Map(
    connection?.groups.map((group) => [group.id, group]),
  );

  if (!connection?.connected) {
    return (
      <section className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-6 text-center shadow-sm">
        <Settings2 className="h-5 w-5 text-muted-foreground" />
        <p className="text-[13px] font-medium">连接元衡后即可在此切换模型</p>
        <p className="text-[11px] text-muted-foreground">
          模型目录与可用分组来自你的元衡账号。
        </p>
      </section>
    );
  }

  if (bootstrapPhase === "loading") {
    return (
      <section
        className="flex min-h-40 flex-col rounded-2xl border bg-card p-4 shadow-sm"
        aria-label="正在检测本机工具"
        aria-busy="true"
      >
        <div className="flex items-center justify-between px-1 pb-3">
          <div>
            <h2 className="font-display text-base font-semibold">快捷控制台</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              正在读取本机工具与配置状态
            </p>
          </div>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
        <div className="space-y-2" aria-hidden>
          {[0, 1].map((item) => (
            <div
              key={item}
              className="animate-pulse rounded-xl border bg-background/60 p-3"
            >
              <div className="flex items-center gap-2.5">
                <span className="h-8 w-8 rounded-lg bg-muted" />
                <div className="space-y-1.5">
                  <div className="h-2.5 w-20 rounded-full bg-muted" />
                  <div className="h-2 w-28 rounded-full bg-muted/70" />
                </div>
              </div>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
                <div className="h-8 rounded-md bg-muted/70" />
                <div className="h-8 rounded-md bg-muted/70" />
                <div className="h-8 rounded-md bg-muted/70" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (bootstrapPhase === "error") {
    return (
      <section className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-6 text-center shadow-sm">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <p className="text-[13px] font-medium">本机工具检测失败</p>
        <p className="text-[11px] text-muted-foreground">
          检测失败不会再显示成“未安装”，请重新检测。
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() => void retryBootstrap()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          重新检测
        </Button>
      </section>
    );
  }

  return (
    <section className="flex flex-col rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between px-1 pb-3">
        <div>
          <h2 className="font-display text-base font-semibold">快捷控制台</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            直接调整模型、令牌分组和推理等级
          </p>
        </div>
        {bootstrapRefreshing && (
          <Loader2
            className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground"
            aria-label="正在核验工具状态"
          />
        )}
        <Button variant="ghost" size="sm" onClick={onOpenTools}>
          安装与维护 <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {bootstrapPhase === "empty" || rows.length === 0 ? (
        <div className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center">
          <p className="text-[12px] text-muted-foreground">
            未检测到已安装的 AI 工具
          </p>
          <Button variant="outline" size="sm" onClick={onOpenTools}>
            去安装与配置
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((app) => {
            const status = statusMap.get(app);
            const configured = Boolean(status?.configured);
            const pending = pendingApps.has(app);
            const selectedModel =
              models[app] ??
              status?.model ??
              status?.recommendedModel ??
              undefined;
            const availableGroups = selectedModel
              ? (connection.modelGroups[selectedModel] ?? [])
              : [];
            const selectedGroup = selectedModel
              ? pickPreferredGroup(
                  connection,
                  selectedModel,
                  groups[app] ?? status?.group ?? undefined,
                )
              : undefined;
            const supportedReasoning = selectedModel
              ? (connection.reasoningLevels[selectedModel] ?? [])
              : [];
            const defaultReasoning = selectedModel
              ? connection.reasoningDefaults?.[selectedModel]
              : undefined;
            const reasoningOptions: YuanhengReasoningLevel[] = [
              "auto",
              ...supportedReasoning.filter((level) => level !== "auto"),
            ];
            const requestedReasoning =
              reasoning[app] ?? status?.reasoning ?? "auto";
            const selectedReasoning: YuanhengReasoningLevel =
              requestedReasoning === "auto" ||
              supportedReasoning.includes(requestedReasoning)
                ? requestedReasoning
                : "auto";
            const showReasoning =
              controlsReasoning(app) && supportedReasoning.length > 0;
            const codexStatus = (() => {
              if (app !== "codex" || !codexBridge.data?.connectedTerminals)
                return null;
              if (codexBridge.data.pendingTerminals > 0) {
                return `待 ${codexBridge.data.pendingTerminals} 个终端下一条消息应用`;
              }
              if (codexBridge.data.appliedTerminals > 0) {
                return `已应用 ${codexBridge.data.model ?? models.codex}`;
              }
              return `已连接 ${codexBridge.data.connectedTerminals} 个终端`;
            })();
            return (
              <div key={app} className="rounded-xl border bg-background/60 p-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <ProviderIcon
                      icon={providerIconOf(app)}
                      name={toolLabel(app)}
                      size={17}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold">
                      {toolLabel(app)}
                    </p>
                    <p
                      className="flex min-w-0 items-center gap-1 text-[9.5px] text-muted-foreground"
                      title={codexStatus ?? undefined}
                    >
                      {configured ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                          <span className="truncate">
                            {codexStatus ?? "配置已生效"}
                          </span>
                        </>
                      ) : (
                        "待配置"
                      )}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 px-3 text-[11px]"
                    disabled={pending}
                    aria-label={`启动 ${toolLabel(app)}`}
                    title={`启动 ${toolLabel(app)}`}
                    onClick={() => void launch(app)}
                  >
                    {pending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5 fill-current" />
                    )}
                    启动
                  </Button>
                </div>

                <div className="mt-2.5 grid gap-2 sm:grid-cols-[minmax(0,1.55fr)_minmax(92px,.8fr)_minmax(92px,.8fr)]">
                  <label className="min-w-0">
                    <span className="mb-1 block text-[9px] font-medium text-muted-foreground">
                      模型
                    </span>
                    <ModelPicker
                      models={connection.models}
                      value={selectedModel}
                      recommended={status?.recommendedModel}
                      label={`${toolLabel(app)} 模型选择`}
                      disabled={pending}
                      className="mt-0 h-8"
                      onRefresh={refreshModels}
                      onChange={(model) => void applyModel(app, model)}
                    />
                  </label>

                  <label className="min-w-0">
                    <span className="mb-1 block text-[9px] font-medium text-muted-foreground">
                      令牌分组
                    </span>
                    <select
                      aria-label={`${toolLabel(app)} 快捷令牌分组`}
                      className="h-8 w-full min-w-0 rounded-md border bg-background px-2 text-[10px] shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                      value={selectedGroup ?? ""}
                      disabled={pending || availableGroups.length <= 1}
                      onChange={(event) =>
                        void applyGroup(app, event.target.value)
                      }
                    >
                      {availableGroups.length === 0 && (
                        <option value="">账号默认</option>
                      )}
                      {availableGroups.map((group) => {
                        const option = groupMap.get(group);
                        return (
                          <option key={group} value={group}>
                            {group}
                            {option?.ratio != null ? ` · ${option.ratio}x` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  <label className="min-w-0">
                    <span className="mb-1 block text-[9px] font-medium text-muted-foreground">
                      推理等级
                    </span>
                    <select
                      aria-label={`${toolLabel(app)} 快捷推理等级`}
                      className="h-8 w-full min-w-0 rounded-md border bg-background px-2 text-[10px] shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                      value={showReasoning ? selectedReasoning : "unsupported"}
                      disabled={pending || !showReasoning}
                      onChange={(event) =>
                        void applyReasoning(
                          app,
                          event.target.value as YuanhengReasoningLevel,
                        )
                      }
                    >
                      {!showReasoning ? (
                        <option value="unsupported">不适用</option>
                      ) : (
                        reasoningOptions.map((level) => (
                          <option key={level} value={level}>
                            {reasoningLabel(level, defaultReasoning)}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
