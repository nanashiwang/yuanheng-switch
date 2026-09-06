import { ExternalLink, HelpCircle, ShieldCheck, Sparkles } from "lucide-react";
import { settingsApi } from "@/lib/api";
import { YUANHENG_WEBSITE_URL } from "@/config/yuanhengBrand";
import { PageHeader } from "./PageHeader";
import { dt } from "./desktopI18n";

const guideSections = [
  {
    title: "快速开始",
    icon: Sparkles,
    items: [
      "登录元衡账号，等待模型和令牌分组同步完成。",
      "进入工作台选择工具，点击配置，客户端会自动写入所需设置。",
      "首次配置后按提示重新打开对应的 AI 工具。",
    ],
  },
  {
    title: "日常使用",
    icon: HelpCircle,
    items: [
      "在工作台直接切换模型、令牌分组和推理等级。",
      "Codex 支持在元衡中转与 OpenAI 官方账号之间切换。",
      "模型切换前会进行兼容性预检，避免配置后才发现协议或模型不匹配。",
    ],
  },
  {
    title: "遇到问题",
    icon: ShieldCheck,
    items: [
      "先点击重新检测，确认工具路径、账号连接和本地路由状态。",
      "配置未生效时，完全退出并重新打开对应工具。",
      "仍然失败时，查看诊断信息，并提供工具、模型、错误提示和发生时间。",
    ],
  },
] as const;

const faq = [
  [
    "为什么配置后还不能用？",
    "多数情况是工具尚未重新打开，或当前模型/分组刚刚发生变化。",
  ],
  [
    "切换官方账号会删除元衡配置吗？",
    "不会。两种模式独立保存，切回元衡后会恢复上次模型和分组。",
  ],
  [
    "第三方 Skill 可以直接安装吗？",
    "可以检索，但社区 Skill 可能未经验证，请确认来源后再安装。",
  ],
] as const;

export function GuidePage() {
  const openWebsite = () => {
    void settingsApi.openExternal(YUANHENG_WEBSITE_URL).catch(() => undefined);
  };

  return (
    <div className="desktop-page mx-auto flex h-full w-full max-w-[1120px] flex-col overflow-hidden px-7 pt-6">
      <PageHeader
        eyebrow={dt("使用说明")}
        title={dt("元衡使用说明")}
        description={dt("安装、配置、模型切换和常见问题都可以在这里快速查看。")}
      />

      <div className="mx-auto min-h-0 w-full max-w-[880px] flex-1 overflow-y-auto pb-8">
        <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm">
          <div>
            <p className="text-[11px] font-semibold">
              {dt("当前说明版本：v0.1")}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {dt("内容会随元衡平台更新，客户端保留本地版本以便离线查看。")}
            </p>
          </div>
          <button
            type="button"
            onClick={openWebsite}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[10px] font-semibold transition-colors hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {dt("打开网页版")}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {guideSections.map(({ title, icon: Icon, items }) => (
            <section
              key={title}
              className="rounded-2xl border bg-card p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <h2 className="font-display text-sm font-semibold">
                  {dt(title)}
                </h2>
              </div>
              <ol className="mt-3 space-y-2.5">
                {items.map((item, index) => (
                  <li
                    key={item}
                    className="flex gap-2 text-[10.5px] leading-5 text-muted-foreground"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-foreground">
                      {index + 1}
                    </span>
                    <span>{dt(item)}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        <section className="mt-3 rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="font-display text-sm font-semibold">
            {dt("常见问题")}
          </h2>
          <div className="mt-3 divide-y">
            {faq.map(([question, answer]) => (
              <details
                key={question}
                className="group py-2.5 first:pt-0 last:pb-0"
              >
                <summary className="cursor-pointer list-none text-[11px] font-semibold marker:hidden">
                  <span className="mr-2 text-primary">＋</span>
                  {dt(question)}
                </summary>
                <p className="mt-1.5 pl-5 text-[10.5px] leading-5 text-muted-foreground">
                  {dt(answer)}
                </p>
              </details>
            ))}
          </div>
        </section>

        <p className="mt-4 text-center text-[10px] text-muted-foreground">
          {dt("请勿分享账号密码、API 密钥或未经授权的声音与内容。")}
        </p>
      </div>
    </div>
  );
}
