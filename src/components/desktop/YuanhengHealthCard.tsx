import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Cloud,
  Download,
  Loader2,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  Stethoscope,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { settingsApi, yuanhengApi } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import {
  useRepairYuanheng,
  useRotateYuanhengCredential,
  useYuanhengConnection,
  useYuanhengDiagnostics,
} from "@/lib/query/yuanheng";
import { extractErrorMessage } from "@/utils/errorUtils";
import { cn } from "@/lib/utils";
import { dt } from "./desktopI18n";

interface YuanhengHealthCardProps {
  compact?: boolean;
  onOpenConnection?: () => void;
  onConfigureTools?: () => void;
}

const STATUS_META = {
  ok: {
    title: "一切正常",
    description: "账号、API 和工具配置均可用。",
    icon: CheckCircle2,
    tone: "text-emerald-600 dark:text-emerald-400",
    background: "bg-emerald-500/10",
  },
  warning: {
    title: "需要完成一项设置",
    description: "元衡可以自动处理大部分配置问题。",
    icon: AlertTriangle,
    tone: "text-amber-600 dark:text-amber-400",
    background: "bg-amber-500/10",
  },
  error: {
    title: "当前不可用",
    description: "检查结果中有需要处理的问题。",
    icon: ShieldAlert,
    tone: "text-red-600 dark:text-red-400",
    background: "bg-red-500/10",
  },
} as const;

export function YuanhengHealthCard({
  compact = false,
  onOpenConnection,
  onConfigureTools,
}: YuanhengHealthCardProps) {
  const { data: connection } = useYuanhengConnection();
  const diagnostics = useYuanhengDiagnostics();
  const repair = useRepairYuanheng();
  const rotateCredential = useRotateYuanhengCredential();
  const [expanded, setExpanded] = useState(false);
  const report = diagnostics.data;
  const meta = STATUS_META[report?.status ?? "warning"];
  const StatusIcon = meta.icon;
  const actions = new Set(
    report?.checks.map((check) => check.action).filter(Boolean) ?? [],
  );

  const handlePrimaryAction = async () => {
    if (!connection?.connected || actions.has("login")) {
      onOpenConnection?.();
      return;
    }
    if (actions.has("configure_tools") && !actions.has("repair_credentials")) {
      onConfigureTools?.();
      return;
    }
    if (report?.status === "ok") {
      await diagnostics.refetch();
      toast.success(dt("体检完成，一切正常"));
      return;
    }
    try {
      const result = await repair.mutateAsync();
      await diagnostics.refetch();
      toast.success(
        result.repairedTools.length > 0
          ? dt("已修复 {{v0}} 个工具配置", { v0: result.repairedTools.length })
          : dt("连接与凭据已恢复"),
      );
    } catch (error) {
      toast.error(extractErrorMessage(error) || dt("自动修复失败，请重新登录"));
    }
  };

  const copyDiagnostics = async () => {
    if (!report) return;
    const safeReport = {
      product: "YuanHeng Desktop",
      generatedAt: new Date().toISOString(),
      status: report.status,
      readyTools: report.readyTools,
      attentionTools: report.attentionTools,
      checks: report.checks,
    };
    try {
      await copyText(JSON.stringify(safeReport, null, 2));
      toast.success(dt("脱敏诊断已复制"));
    } catch {
      toast.error(dt("复制诊断失败"));
    }
  };

  const rotateDeviceCredential = async () => {
    if (
      !window.confirm(
        dt(
          "将重新生成当前设备凭据，并自动更新已经配置的工具。旧凭据会被撤销，是否继续？",
        ),
      )
    ) {
      return;
    }
    try {
      const result = await rotateCredential.mutateAsync();
      await diagnostics.refetch();
      toast.success(
        result.updatedTools.length > 0
          ? dt("凭据已更新，并同步到 {{v0}} 个工具", {
              v0: result.updatedTools.length,
            })
          : dt("本机凭据已重新生成"),
      );
    } catch (error) {
      toast.error(extractErrorMessage(error) || dt("重新生成凭据失败"));
    }
  };

  const exportDiagnostics = async () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    try {
      const filePath = await settingsApi.saveFileDialog(
        `yuanheng-diagnostics-${stamp}.json`,
      );
      if (!filePath) return;
      const savedPath = await yuanhengApi.exportDiagnostics(filePath);
      toast.success(dt("脱敏诊断已导出：{{v0}}", { v0: savedPath }));
    } catch (error) {
      toast.error(extractErrorMessage(error) || dt("导出诊断失败"));
    }
  };

  if (diagnostics.isLoading && !report) {
    return (
      <section className="flex min-h-36 items-center justify-center rounded-2xl border bg-card">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  const primaryLabel =
    !connection?.connected || actions.has("login")
      ? dt("前往登录")
      : actions.has("configure_tools") && !actions.has("repair_credentials")
        ? dt("配置工具")
        : report?.status === "ok"
          ? dt("重新检查")
          : dt("一键修复");

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className={cn("flex items-start gap-3 p-5", compact && "p-4")}>
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            meta.background,
            meta.tone,
          )}
        >
          <StatusIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {dt("智能体检")}
          </p>
          <h2 className="mt-1 font-display text-base font-semibold">
            {report ? dt(meta.title) : dt("暂时无法检查")}
          </h2>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            {report?.checks.find((item) => item.status !== "ok")?.message
              ? dt(report.checks.find((item) => item.status !== "ok")!.message)
              : dt(meta.description)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t bg-muted/20 px-4 py-3">
        <Button
          size="sm"
          onClick={() => void handlePrimaryAction()}
          disabled={repair.isPending || diagnostics.isFetching}
        >
          {repair.isPending || diagnostics.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : report?.status === "ok" ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : !connection?.connected || actions.has("login") ? (
            <Cloud className="h-3.5 w-3.5" />
          ) : (
            <Wrench className="h-3.5 w-3.5" />
          )}
          {primaryLabel}
        </Button>
        {report && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setExpanded((value) => !value)}
          >
            <Stethoscope className="h-3.5 w-3.5" />
            {dt("检查详情")}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </Button>
        )}
      </div>

      {expanded && report && (
        <div className="space-y-2 border-t px-4 py-3">
          {report.checks.map((check) => (
            <div
              key={check.id}
              className="flex items-start gap-2 rounded-lg bg-muted/35 px-3 py-2"
            >
              {check.status === "ok" ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-medium">{dt(check.title)}</p>
                <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                  {dt(check.message)}
                </p>
              </div>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-[11px]"
            onClick={() => void copyDiagnostics()}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            {dt("复制脱敏诊断")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-[11px]"
            onClick={() => void exportDiagnostics()}
          >
            <Download className="h-3.5 w-3.5" />
            {dt("导出脱敏诊断")}
          </Button>
          {connection?.connected && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-[11px]"
              disabled={rotateCredential.isPending}
              onClick={() => void rotateDeviceCredential()}
            >
              {rotateCredential.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCw className="h-3.5 w-3.5" />
              )}
              {dt("重新生成本机凭据")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
