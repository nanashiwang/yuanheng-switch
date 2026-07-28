import { useMemo } from "react";
import { CheckCircle2, Loader2, Play } from "lucide-react";
import type { YuanhengToolId } from "@/lib/api";
import { ProviderIcon } from "@/components/ProviderIcon";
import { cn } from "@/lib/utils";
import { ModelPicker } from "./ModelPicker";
import { toolLabel } from "./ToolSetupGrid";
import {
  providerIconOf,
  type ModelSwitchCenterState,
} from "./useModelSwitchCenter";

const CHIP_COUNT = 3;

interface FocusToolCardProps {
  switcher: ModelSwitchCenterState;
  focusApp?: YuanhengToolId;
}

/**
 * 首页焦点工具卡：当前工具的大字模型展示 + 同族模型一键切换。
 * 切换逻辑与下方「全部工具」列表共享同一份状态。
 */
export function FocusToolCard({ switcher, focusApp }: FocusToolCardProps) {
  const {
    connection,
    rows,
    models,
    groups,
    reasoning,
    pendingApps,
    statusMap,
    applyModel,
    launch,
  } = switcher;

  const app =
    (focusApp && rows.includes(focusApp) ? focusApp : undefined) ?? rows[0];
  const status = app ? statusMap.get(app) : undefined;
  const current = app ? models[app] : undefined;
  const currentGroup = app ? (groups[app] ?? status?.group) : undefined;
  const currentReasoning = app
    ? (reasoning[app] ?? status?.reasoning ?? "auto")
    : "auto";

  // 同族模型 chips：推荐模型优先，其余按当前模型前缀归类
  const chips = useMemo(() => {
    if (!connection || !app || !current) return [];
    const family = current.split("-")[0];
    const sameFamily = connection.models.filter(
      (model) => model !== current && model.split("-")[0] === family,
    );
    const picked: string[] = [current];
    const recommended = status?.recommendedModel;
    if (recommended && recommended !== current) picked.push(recommended);
    for (const model of sameFamily) {
      if (picked.length >= CHIP_COUNT) break;
      if (!picked.includes(model)) picked.push(model);
    }
    return picked.slice(0, CHIP_COUNT);
  }, [app, connection, current, status?.recommendedModel]);

  if (!connection?.connected || !app) return null;

  const pending = pendingApps.has(app);
  const configured = Boolean(status?.configured);

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f2a26] to-[#173f3a] p-5 text-[#eef5f2] shadow-[0_18px_40px_-22px_rgba(15,42,38,0.55)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-14 -top-20 h-52 w-52 rounded-full border border-white/[0.07]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-9 right-3 h-32 w-32 rounded-full border border-white/[0.07]"
      />

      <div className="relative flex items-center gap-3">
        <span className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-white/10 bg-white/10">
          <ProviderIcon
            icon={providerIconOf(app)}
            name={toolLabel(app)}
            size={20}
          />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
            当前工具
          </p>
          <p className="mt-0.5 flex items-center gap-2 font-display text-[17px] font-semibold">
            {toolLabel(app)}
            {configured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-normal text-emerald-300">
                <CheckCircle2 className="h-2.5 w-2.5" />
                已配置
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => void launch(app)}
          className="ml-auto inline-flex h-[34px] items-center gap-1.5 rounded-[10px] bg-[#e9b67c] px-4 text-[12px] font-semibold text-[#163a36] transition-colors hover:bg-[#f3c995] disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" />
          )}
          启动
        </button>
      </div>

      <div className="relative mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[11px] text-white/55">当前模型</span>
        <span className="font-display text-2xl font-semibold tabular-nums tracking-tight">
          {current ?? "未选择"}
        </span>
        {currentGroup && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/75">
            {currentGroup} 分组
          </span>
        )}
        {currentReasoning !== "auto" && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/75">
            {currentReasoning} 推理
          </span>
        )}
      </div>

      <div className="relative mt-3.5 flex flex-wrap items-center gap-2">
        <span className="mr-0.5 text-[10px] text-white/50">一键切换</span>
        {chips.map((model) => {
          const active = model === current;
          return (
            <button
              key={model}
              type="button"
              disabled={pending || active}
              onClick={() => void applyModel(app, model)}
              className={cn(
                "inline-flex h-[30px] items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3.5 text-[11.5px] text-white/85 transition-colors hover:bg-white/[0.12] disabled:cursor-default",
                active &&
                  "border-[#e9b67c] bg-[#e9b67c] font-semibold text-[#163a36] hover:bg-[#e9b67c]",
              )}
            >
              {model}
              {model === status?.recommendedModel && (
                <span
                  className={cn(
                    "text-[9px]",
                    active ? "opacity-70" : "text-emerald-300",
                  )}
                >
                  推荐
                </span>
              )}
            </button>
          );
        })}
        <ModelPicker
          models={connection.models}
          value={current}
          recommended={status?.recommendedModel}
          label={`${toolLabel(app)} 全部模型`}
          disabled={pending}
          triggerLabel={`全部 ${connection.models.length} 个模型`}
          className="mt-0 h-[30px] w-auto rounded-full border-dashed border-white/20 bg-transparent px-3.5 text-[11.5px] text-white/60 shadow-none hover:bg-white/10"
          onChange={(model) => void applyModel(app, model)}
        />
      </div>
    </section>
  );
}
