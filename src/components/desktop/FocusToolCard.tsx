import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Play,
  RefreshCw,
  Wrench,
} from "lucide-react";
import type { YuanhengToolId } from "@/lib/api";
import { ProviderIcon } from "@/components/ProviderIcon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ModelPicker } from "./ModelPicker";
import { pickPreferredGroup, toolLabel } from "./ToolSetupGrid";
import {
  providerIconOf,
  type ModelSwitchCenterState,
} from "./useModelSwitchCenter";
import { groupModelsByVendor, modelVendorOf } from "./modelVendors";
import { dt } from "./desktopI18n";

interface FocusToolCardProps {
  switcher: ModelSwitchCenterState;
  focusApp?: YuanhengToolId;
  onOpenTools: () => void;
}

const focusCardShell =
  "relative min-h-[246px] overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f2a26] to-[#173f3a] p-5 text-[#eef5f2] shadow-[0_18px_40px_-22px_rgba(15,42,38,0.55)]";

interface FocusSelectOption {
  value: string;
  label: string;
  icon?: string;
  iconName?: string;
}

/**
 * 焦点卡内的紧凑选择器。
 *
 * 不使用原生 select：macOS WebView 会把深色触发器的浅色文字继承给
 * 系统白色弹层，导致选项只有悬停时才可见。应用自绘弹层使用主题色，
 * 与模型选择器保持一致，也避免不同系统的原生菜单行为差异。
 */
function FocusSelectPicker({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: FocusSelectOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const selected =
    options.find((option) => option.value === value) ?? options[0];
  const selectedValue = selected ? `value:${selected.value}` : undefined;

  return (
    <Select
      value={selectedValue}
      disabled={disabled || options.length === 0}
      onValueChange={(nextValue) => onChange(nextValue.slice("value:".length))}
    >
      <SelectTrigger
        aria-label={label}
        className="h-8 min-w-0 gap-2 border-white/15 bg-white/[0.08] px-2.5 text-left text-[10.5px] text-white shadow-sm transition-colors hover:bg-white/[0.12] focus:border-[#e9b67c]/70 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selected?.icon && (
            <ProviderIcon
              icon={selected.icon}
              name={selected.iconName ?? selected.label}
              size={14}
            />
          )}
          <span className="min-w-0 flex-1 truncate">
            {selected?.label ?? value}
          </span>
        </span>
      </SelectTrigger>
      <SelectContent
        position="popper"
        sideOffset={6}
        className="z-[1000] max-h-[240px] min-w-[var(--radix-select-trigger-width)]"
        onClick={(event) => event.stopPropagation()}
      >
        {options.map((option) => (
          <SelectItem
            key={option.value || "__default__"}
            value={`value:${option.value}`}
            className="text-[10.5px]"
          >
            <span className="flex min-w-0 items-center gap-2">
              {option.icon && (
                <ProviderIcon
                  icon={option.icon}
                  name={option.iconName ?? option.label}
                  size={14}
                />
              )}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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
      aria-label={dt("正在检测本机工具")}
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
      <p className="sr-only">{dt("正在读取本机工具与配置状态")}</p>
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
          {error ? dt("本机工具检测失败") : dt("尚未检测到已安装的 AI 工具")}
        </h2>
        <p className="mt-1 max-w-sm text-[10.5px] text-white/55">
          {error
            ? dt("没有将检测失败误判为未安装，你可以重新检测或进入工具管理。")
            : dt("安装或配置工具后，这里会显示当前工具、模型和令牌分组。")}
        </p>
        <div className="mt-4 flex items-center gap-2">
          {error && (
            <button
              type="button"
              onClick={() => void onRetry()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.08] px-3 text-[11px] font-semibold transition-colors hover:bg-white/[0.13]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {dt("重新检测")}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenTools}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#e9b67c] px-3 text-[11px] font-semibold text-[#163a36] transition-colors hover:bg-[#f3c995]"
          >
            <Wrench className="h-3.5 w-3.5" />
            {error ? dt("打开工具管理") : dt("安装与配置")}
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
    terminalModels,
    bootstrapPhase,
    retryBootstrap,
    rows,
    models,
    groups,
    reasoning,
    pendingApps,
    restartRequiredApps,
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
    () => groupModelsByVendor(terminalModels),
    [terminalModels],
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
  const restartRequired = restartRequiredApps.has(app);
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
  const vendorOptions = vendorGroups.map((vendor) => ({
    value: vendor.id,
    label: `${vendor.label} · ${vendor.models.length}`,
    icon: vendor.icon,
    iconName: vendor.label,
  }));
  const groupOptions =
    availableGroups.length === 0
      ? [{ value: "", label: dt("账号默认") }]
      : availableGroups.map((group) => {
          const option = groupMap.get(group);
          return {
            value: group,
            label: `${group}${option?.ratio != null ? ` · ${option.ratio}x` : ""}`,
          };
        });

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
            {dt("当前工具")}
          </p>
          <p className="mt-0.5 flex items-center gap-2 font-display text-[17px] font-semibold">
            {toolLabel(app)}
            {configured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-normal text-emerald-300">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {dt("已配置")}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          aria-label={
            restartRequired
              ? dt("重启并应用 {{v0}}", { v0: toolLabel(app) })
              : dt("启动 {{v0}}", { v0: toolLabel(app) })
          }
          onClick={() => void launch(app)}
          className="ml-auto inline-flex h-[34px] items-center gap-1.5 rounded-[10px] bg-[#e9b67c] px-4 text-[12px] font-semibold text-[#163a36] transition-colors hover:bg-[#f3c995] disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" />
          )}
          {restartRequired ? dt("重启并应用") : dt("启动")}
        </button>
      </div>

      <div className="relative mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[11px] text-white/55">{dt("当前模型")}</span>
        <span className="font-display text-2xl font-semibold tabular-nums tracking-tight">
          {current ?? dt("未选择")}
        </span>
        {currentGroup && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/75">
            {currentGroup} {dt("分组")}
          </span>
        )}
        {currentReasoning !== "auto" && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/75">
            {currentReasoning} {dt("推理")}
          </span>
        )}
      </div>

      <div className="relative mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold text-white/75">
            {dt("快捷切换")}
          </p>
          <p className="text-[9.5px] text-white/45">
            {dt("先选供应商，再选模型；修改后立即生效")}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(116px,.8fr)_minmax(0,1.35fr)_minmax(108px,.8fr)]">
          <label className="min-w-0">
            <span className="mb-1 block text-[9px] font-medium text-white/50">
              {dt("1 · 模型供应商")}
            </span>
            <FocusSelectPicker
              label={dt("{{v0}} 模型供应商", { v0: toolLabel(app) })}
              value={selectedVendor?.id ?? ""}
              options={vendorOptions}
              disabled={pending || vendorGroups.length === 0}
              onChange={(vendor) =>
                setSelectedVendors((currentSelections) => ({
                  ...currentSelections,
                  [app]: vendor,
                }))
              }
            />
          </label>

          <label className="min-w-0">
            <span className="mb-1 block text-[9px] font-medium text-white/50">
              {dt("2 · 细分模型")}
            </span>
            <ModelPicker
              models={selectedVendor?.models ?? []}
              value={visibleModel}
              recommended={recommendedModel}
              label={dt("{{v0}} {{v1}}模型", {
                v0: toolLabel(app),
                v1: selectedVendor?.label ?? "",
              })}
              disabled={pending || !selectedVendor}
              triggerLabel={
                visibleModel ??
                dt("选择 {{v0}}模型", {
                  v0: selectedVendor?.label ?? dt("供应商"),
                })
              }
              className="mt-0 h-8 border-white/15 bg-white/[0.08] text-[10.5px] text-white shadow-sm hover:bg-white/[0.12]"
              onRefresh={refreshModels}
              onChange={(model) => void applyModel(app, model)}
            />
          </label>

          <label className="min-w-0">
            <span className="mb-1 block text-[9px] font-medium text-white/50">
              {dt("3 · 令牌分组")}
            </span>
            <FocusSelectPicker
              label={dt("{{v0}} 当前工具令牌分组", {
                v0: toolLabel(app),
              })}
              value={selectedGroup ?? ""}
              options={groupOptions}
              disabled={pending || availableGroups.length <= 1}
              onChange={(group) => void applyGroup(app, group)}
            />
          </label>
        </div>
      </div>
    </section>
  );
}
