import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Play,
  RefreshCw,
  Wrench,
} from "lucide-react";
import type { YuanhengToolId } from "@/lib/api";
import { ProviderIcon } from "@/components/ProviderIcon";
import { ModelPicker } from "./ModelPicker";
import { pickPreferredGroup, toolLabel } from "./ToolSetupGrid";
import {
  providerIconOf,
  type ModelSwitchCenterState,
} from "./useModelSwitchCenter";
import { groupModelsByVendor, modelVendorOf } from "./modelVendors";

interface FocusToolCardProps {
  switcher: ModelSwitchCenterState;
  focusApp?: YuanhengToolId;
  onOpenTools: () => void;
}

const focusCardShell =
  "relative min-h-[246px] overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f2a26] to-[#173f3a] p-5 text-[#eef5f2] shadow-[0_18px_40px_-22px_rgba(15,42,38,0.55)]";

function FocusToolDecoration() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-14 -top-20 h-52 w-52 rounded-full border border-white/[0.07]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-9 right-3 h-32 w-32 rounded-full border border-white/[0.07]"
      />
    </>
  );
}

function FocusToolLoadingCard() {
  return (
    <section
      className={focusCardShell}
      aria-label="正在检测本机工具"
      aria-busy="true"
    >
      <FocusToolDecoration />
      <div className="relative animate-pulse">
        <div className="flex items-center gap-3">
          <span className="h-[42px] w-[42px] rounded-xl bg-white/10" />
          <div className="space-y-2">
            <div className="h-2 w-16 rounded-full bg-white/10" />
            <div className="h-4 w-24 rounded-full bg-white/15" />
          </div>
          <div className="ml-auto h-[34px] w-20 rounded-[10px] bg-white/10" />
        </div>
        <div className="mt-5 flex items-center gap-3">
          <div className="h-2.5 w-14 rounded-full bg-white/10" />
          <div className="h-7 w-40 rounded-full bg-white/15" />
        </div>
        <div className="mt-5 rounded-xl border border-white/10 bg-black/10 p-3">
          <div className="mb-3 h-2.5 w-20 rounded-full bg-white/10" />
          <div className="grid gap-2 sm:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="space-y-1.5">
                <div className="h-2 w-14 rounded-full bg-white/10" />
                <div className="h-8 rounded-md bg-white/10" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="sr-only">正在读取本机工具与配置状态</p>
    </section>
  );
}

function FocusToolStateCard({
  error,
  onOpenTools,
  onRetry,
}: {
  error?: boolean;
  onOpenTools: () => void;
  onRetry: () => Promise<void>;
}) {
  const Icon = error ? AlertTriangle : Wrench;
  return (
    <section className={focusCardShell}>
      <FocusToolDecoration />
      <div className="relative flex min-h-[206px] flex-col items-center justify-center text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/10">
          <Icon className="h-5 w-5 text-[#e9b67c]" />
        </span>
        <h2 className="mt-3 font-display text-[16px] font-semibold">
          {error ? "本机工具检测失败" : "尚未检测到已安装的 AI 工具"}
        </h2>
        <p className="mt-1 max-w-sm text-[10.5px] text-white/55">
          {error
            ? "没有将检测失败误判为未安装，你可以重新检测或进入工具管理。"
            : "安装或配置工具后，这里会显示当前工具、模型和令牌分组。"}
        </p>
        <div className="mt-4 flex items-center gap-2">
          {error && (
            <button
              type="button"
              onClick={() => void onRetry()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.08] px-3 text-[11px] font-semibold transition-colors hover:bg-white/[0.13]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重新检测
            </button>
          )}
          <button
            type="button"
            onClick={onOpenTools}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#e9b67c] px-3 text-[11px] font-semibold text-[#163a36] transition-colors hover:bg-[#f3c995]"
          >
            <Wrench className="h-3.5 w-3.5" />
            {error ? "打开工具管理" : "安装与配置"}
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * 首页焦点工具卡：当前工具的大字模型展示 + 供应商 / 模型 / 分组切换。
 * 切换逻辑与下方「全部工具」列表共享同一份状态。
 */
export function FocusToolCard({
  switcher,
  focusApp,
  onOpenTools,
}: FocusToolCardProps) {
  const {
    connection,
    bootstrapPhase,
    retryBootstrap,
    rows,
    models,
    groups,
    reasoning,
    pendingApps,
    statusMap,
    refreshModels,
    applyModel,
    applyGroup,
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
  const vendorGroups = useMemo(
    () => groupModelsByVendor(connection?.models ?? []),
    [connection?.models],
  );
  const currentVendorId = current ? modelVendorOf(current).id : undefined;
  const [selectedVendors, setSelectedVendors] = useState<
    Partial<Record<YuanhengToolId, string>>
  >({});

  if (bootstrapPhase === "loading" || !connection?.connected) {
    return <FocusToolLoadingCard />;
  }
  if (bootstrapPhase === "error") {
    return (
      <FocusToolStateCard
        error
        onOpenTools={onOpenTools}
        onRetry={retryBootstrap}
      />
    );
  }
  if (bootstrapPhase === "empty" || !app) {
    return (
      <FocusToolStateCard onOpenTools={onOpenTools} onRetry={retryBootstrap} />
    );
  }

  const pending = pendingApps.has(app);
  const configured = Boolean(status?.configured);
  const selectedVendor =
    vendorGroups.find((vendor) => vendor.id === selectedVendors[app]) ??
    vendorGroups.find((vendor) => vendor.id === currentVendorId) ??
    vendorGroups[0];
  const visibleModel =
    selectedVendor?.id === currentVendorId ? current : undefined;
  const recommendedModel =
    status?.recommendedModel &&
    modelVendorOf(status.recommendedModel).id === selectedVendor?.id
      ? status.recommendedModel
      : undefined;
  const availableGroups = current
    ? (connection.modelGroups[current] ?? [])
    : [];
  const selectedGroup = current
    ? pickPreferredGroup(
        connection,
        current,
        groups[app] ?? status?.group ?? undefined,
      )
    : undefined;
  const groupMap = new Map(connection.groups.map((group) => [group.id, group]));

  return (
    <section className={focusCardShell}>
      <FocusToolDecoration />

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

      <div className="relative mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold text-white/75">快捷切换</p>
          <p className="text-[9.5px] text-white/45">
            先选供应商，再选模型；修改后立即生效
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(116px,.8fr)_minmax(0,1.35fr)_minmax(108px,.8fr)]">
          <label className="min-w-0">
            <span className="mb-1 block text-[9px] font-medium text-white/50">
              1 · 模型供应商
            </span>
            <div className="relative">
              {selectedVendor && (
                <ProviderIcon
                  icon={selectedVendor.icon}
                  name={selectedVendor.label}
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2"
                />
              )}
              <select
                aria-label={`${toolLabel(app)} 模型供应商`}
                value={selectedVendor?.id ?? ""}
                disabled={pending || vendorGroups.length === 0}
                className="h-8 w-full min-w-0 appearance-none rounded-md border border-white/15 bg-white/[0.08] pl-8 pr-7 text-[10.5px] text-white shadow-sm outline-none [color-scheme:dark] transition-colors hover:bg-white/[0.12] focus:border-[#e9b67c]/70 disabled:cursor-not-allowed disabled:opacity-60"
                onChange={(event) =>
                  setSelectedVendors((currentSelections) => ({
                    ...currentSelections,
                    [app]: event.target.value,
                  }))
                }
              >
                {vendorGroups.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.label} · {vendor.models.length}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/45" />
            </div>
          </label>

          <label className="min-w-0">
            <span className="mb-1 block text-[9px] font-medium text-white/50">
              2 · 细分模型
            </span>
            <ModelPicker
              models={selectedVendor?.models ?? []}
              value={visibleModel}
              recommended={recommendedModel}
              label={`${toolLabel(app)} ${selectedVendor?.label ?? ""}模型`}
              disabled={pending || !selectedVendor}
              triggerLabel={
                visibleModel ?? `选择 ${selectedVendor?.label ?? "供应商"}模型`
              }
              className="mt-0 h-8 border-white/15 bg-white/[0.08] text-[10.5px] text-white shadow-sm hover:bg-white/[0.12]"
              onRefresh={refreshModels}
              onChange={(model) => void applyModel(app, model)}
            />
          </label>

          <label className="min-w-0">
            <span className="mb-1 block text-[9px] font-medium text-white/50">
              3 · 令牌分组
            </span>
            <div className="relative">
              <select
                aria-label={`${toolLabel(app)} 当前工具令牌分组`}
                value={selectedGroup ?? ""}
                disabled={pending || availableGroups.length <= 1}
                className="h-8 w-full min-w-0 appearance-none rounded-md border border-white/15 bg-white/[0.08] pl-2 pr-7 text-[10.5px] text-white shadow-sm outline-none [color-scheme:dark] transition-colors hover:bg-white/[0.12] focus:border-[#e9b67c]/70 disabled:cursor-not-allowed disabled:opacity-60"
                onChange={(event) => void applyGroup(app, event.target.value)}
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
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/45" />
            </div>
          </label>
        </div>
      </div>
    </section>
  );
}
