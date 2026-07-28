import {
  ArrowRight,
  Layers3,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import appIcon from "@/assets/icons/app-icon.png";
import { YuanhengConnectionPanel } from "./YuanhengConnectionPanel";

interface YuanhengAccessScreenProps {
  loading?: boolean;
}

export function YuanhengAccessScreen({
  loading = false,
}: YuanhengAccessScreenProps) {
  return (
    <main className="relative flex h-full min-h-0 overflow-y-auto bg-[#10191a] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(57,143,125,0.28),transparent_32%),radial-gradient(circle_at_84%_78%,rgba(214,149,84,0.18),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.16)_1px,transparent_1px)] [background-size:42px_42px]" />

      <div className="relative mx-auto grid min-h-full w-full max-w-[1120px] items-center gap-10 px-8 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:px-14">
        <section className="animate-rise-in max-w-lg">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">
              <img src={appIcon} alt="" className="h-10 w-10 object-contain" />
            </span>
            <div>
              <p className="font-display text-lg font-semibold tracking-wide">
                元衡桌面端
              </p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/45">
                Yuanheng AI Workspace
              </p>
            </div>
          </div>

          <p className="mt-10 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#e2ae75]">
            一个入口，连接全部工具
          </p>
          <h1 className="mt-3 font-display text-[34px] font-semibold leading-[1.18] tracking-[-0.035em] sm:text-[42px]">
            登录后，模型与额度
            <br />
            自动同步到本机
          </h1>
          <p className="mt-4 max-w-md text-[13px] leading-6 text-slate-300/70">
            使用元衡账号统一管理 Claude、Codex、ChatGPT 等 AI
            工具，无需逐个填写接口与密钥。
          </p>

          <div className="mt-8 grid max-w-md gap-2.5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {[
              { icon: Layers3, label: "模型自动同步" },
              { icon: Sparkles, label: "配置立即生效" },
              { icon: ShieldCheck, label: "本机安全凭据" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[11px] text-slate-300"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-[#e2ae75]" />
                {label}
              </div>
            ))}
          </div>
        </section>

        <section className="animate-rise-in stagger-1 w-full lg:justify-self-end">
          {loading ? (
            <div
              className="flex min-h-[360px] items-center justify-center rounded-[26px] border border-white/10 bg-white/[0.055] backdrop-blur-xl"
              aria-live="polite"
            >
              <div className="text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#e2ae75]" />
                <p className="mt-3 text-[12px] text-slate-400">
                  正在检查登录状态…
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-[26px] border border-white/10 bg-[#f7f4ed] p-2 text-[#142d2a] shadow-[0_30px_90px_-35px_rgba(0,0,0,0.75)] dark:bg-[#152221] dark:text-white">
              <YuanhengConnectionPanel compact />
              <p className="flex items-center justify-center gap-1.5 px-4 pb-3 pt-1 text-[10px] text-muted-foreground">
                登录后自动进入工作台
                <ArrowRight className="h-3 w-3" />
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
