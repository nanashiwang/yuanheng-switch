import { useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  MonitorCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useYuanhengToolStatuses } from "@/lib/query/yuanheng";
import { cn } from "@/lib/utils";
import { ToolSetupGrid } from "./ToolSetupGrid";
import { YuanhengConnectionPanel } from "./YuanhengConnectionPanel";
import { dt } from "./desktopI18n";

interface OnboardingWizardProps {
  open: boolean;
  onFinish: () => void;
}

const STEPS = [
  { label: "欢迎", icon: Sparkles },
  { label: "连接元衡", icon: Cloud },
  { label: "配置工具", icon: Wrench },
  { label: "完成", icon: MonitorCheck },
];

export function OnboardingWizard({ open, onFinish }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const { data: toolStatuses = [] } = useYuanhengToolStatuses();
  const configuredCount = toolStatuses.filter((item) => item.configured).length;

  useEffect(() => {
    if (!open) setStep(0);
  }, [open]);

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
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em]">
            {dt("一次连接，配置所有 AI 工具")}
          </h2>
          <p className="mt-3 max-w-lg text-[13px] leading-6 text-muted-foreground">
            {dt(
              "连接元衡账号，选择本机需要使用的工具，自动写入 API、认证和推荐模型。",
            )}
          </p>
        </div>
      );
    }

    if (step === 1) {
      return (
        <div className="min-h-[330px] px-6 py-2">
          <YuanhengConnectionPanel compact onConnected={() => setStep(2)} />
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            {dt("也可以暂时跳过，稍后在“连接与路由”中完成。")}
          </p>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="max-h-[470px] min-h-[330px] overflow-y-auto px-6 py-2">
          <div className="mb-4">
            <h2 className="font-display text-xl font-semibold">
              {dt("选择需要的工具")}
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {dt("只配置你实际使用的工具，之后可以随时增减。")}
            </p>
          </div>
          <ToolSetupGrid compact onConfigured={() => setStep(3)} />
        </div>
      );
    }

    return (
      <div className="flex min-h-[330px] flex-col items-center justify-center px-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
          <Check className="h-7 w-7" />
        </span>
        <h2 className="mt-5 font-display text-2xl font-semibold">
          {dt("配置完成")}
        </h2>
        <p className="mt-2 max-w-md text-[13px] leading-6 text-muted-foreground">
          {configuredCount > 0
            ? dt("已有 {{v0}} 个 AI 工具接入元衡，可以直接开始使用。", {
                v0: configuredCount,
              })
            : dt("你可以稍后进入工具管理页面完成配置。")}
        </p>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && finish()}>
      <DialogContent className="max-w-4xl overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{dt("首次配置")}</DialogTitle>
          <DialogDescription>
            {dt("连接元衡账号并配置本机 AI 工具")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 border-b bg-muted/35 px-6 py-3">
          {STEPS.map((item, index) => (
            <div
              key={dt(item.label)}
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
              {dt(item.label)}
            </div>
          ))}
        </div>
        {renderStep()}
        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="ghost" onClick={finish}>
            {dt("稍后配置")}
          </Button>
          <div className="flex-1" />
          {step > 0 && (
            <Button
              variant="outline"
              onClick={() => setStep((value) => value - 1)}
            >
              <ChevronLeft className="h-4 w-4" /> {dt("上一步")}
            </Button>
          )}
          {step < 3 ? (
            <Button onClick={() => setStep((value) => value + 1)}>
              {dt("继续")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={finish}>
              <Check className="h-4 w-4" /> {dt("进入工具中心")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
