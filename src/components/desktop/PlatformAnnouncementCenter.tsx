import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Info,
  LoaderCircle,
  Megaphone,
  RefreshCw,
  X,
} from "lucide-react";
import type { YuanhengAnnouncement, YuanhengAnnouncementType } from "@/lib/api";
import { useYuanhengAnnouncements } from "@/lib/query/yuanheng";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DISMISSED_ANNOUNCEMENT_KEY =
  "yuanheng.dashboard.announcement-dismissed.v2";
const SUMMARY_LIMIT = 128;

const TYPE_META: Record<
  YuanhengAnnouncementType,
  {
    label: string;
    icon: typeof Info;
    bannerClass: string;
    iconClass: string;
    badgeClass: string;
  }
> = {
  default: {
    label: "公告",
    icon: Info,
    bannerClass:
      "border-emerald-200/80 bg-emerald-50/80 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200",
    iconClass: "text-emerald-600 dark:text-emerald-300",
    badgeClass:
      "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  ongoing: {
    label: "进行中",
    icon: BellRing,
    bannerClass:
      "border-sky-200/80 bg-sky-50/80 text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200",
    iconClass: "text-sky-600 dark:text-sky-300",
    badgeClass:
      "border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300",
  },
  success: {
    label: "已上线",
    icon: CheckCircle2,
    bannerClass:
      "border-emerald-200/80 bg-emerald-50/80 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200",
    iconClass: "text-emerald-600 dark:text-emerald-300",
    badgeClass:
      "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  warning: {
    label: "重要提醒",
    icon: AlertTriangle,
    bannerClass:
      "border-amber-200 bg-amber-50/90 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200",
    iconClass: "text-amber-600 dark:text-amber-300",
    badgeClass:
      "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
  },
  error: {
    label: "紧急通知",
    icon: CircleAlert,
    bannerClass:
      "border-red-200 bg-red-50/90 text-red-900 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200",
    iconClass: "text-red-600 dark:text-red-300",
    badgeClass:
      "border-red-200 bg-red-100 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
  },
};

function htmlToPlainText(raw: string): string {
  if (typeof DOMParser === "undefined" || !/<[a-z][\s\S]*>/i.test(raw)) {
    return raw;
  }

  const document = new DOMParser().parseFromString(raw, "text/html");
  document
    .querySelectorAll("style, script, noscript, template")
    .forEach((node) => node.remove());
  document.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  document
    .querySelectorAll("h1, h2, h3, h4, p, li, section, article")
    .forEach((node) => node.append("\n"));
  return document.body.textContent ?? "";
}

export function announcementToPlainText(raw: string): string {
  return htmlToPlainText(raw)
    .replace(/\[([^\]]+)]\([^\s)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function summarizeAnnouncement(raw: string): string {
  const text = announcementToPlainText(raw);
  if (!text) return "";
  const parts = text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const summary = parts.slice(0, 2).join(" · ");
  return summary.length > SUMMARY_LIMIT
    ? `${summary.slice(0, SUMMARY_LIMIT).trim()}…`
    : summary;
}

function contentFingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function getAnnouncementIdentity(
  announcement: YuanhengAnnouncement,
): string {
  return [
    announcement.id,
    announcement.publishDate,
    contentFingerprint(announcement.content),
  ].join(":");
}

function formatAnnouncementDate(value: string): string {
  if (!value) return "平台同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "平台同步";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function AnnouncementDialog({
  open,
  onOpenChange,
  announcements,
  initialAnnouncementId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcements: YuanhengAnnouncement[];
  initialAnnouncementId?: string;
}) {
  const [selectedId, setSelectedId] = useState(
    initialAnnouncementId ?? announcements[0]?.id ?? "",
  );

  useEffect(() => {
    if (open) {
      setSelectedId(initialAnnouncementId ?? announcements[0]?.id ?? "");
    }
  }, [announcements, initialAnnouncementId, open]);

  const selected =
    announcements.find((announcement) => announcement.id === selectedId) ??
    announcements[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[78vh] max-w-[860px] overflow-hidden p-0">
        <DialogHeader className="relative pr-14">
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-4.5 w-4.5 text-primary" />
            平台公告
          </DialogTitle>
          <DialogDescription>
            与元衡平台公告中心同步，每分钟自动检查更新
          </DialogDescription>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="关闭公告中心"
            className="absolute right-5 top-5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 md:grid-cols-[270px_minmax(0,1fr)]">
          <div className="max-h-[58vh] overflow-y-auto border-b border-border-default bg-muted/15 p-2 md:border-b-0 md:border-r">
            {announcements.map((announcement) => {
              const meta = TYPE_META[announcement.type];
              const active = announcement.id === selected?.id;
              return (
                <button
                  key={getAnnouncementIdentity(announcement)}
                  type="button"
                  onClick={() => setSelectedId(announcement.id)}
                  className={cn(
                    "mb-1.5 w-full rounded-xl border px-3 py-2.5 text-left transition-colors last:mb-0",
                    active
                      ? "border-primary/25 bg-primary/[0.07]"
                      : "border-transparent hover:border-border-default hover:bg-background",
                  )}
                >
                  <span className="mb-1.5 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
                        meta.badgeClass,
                      )}
                    >
                      {meta.label}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {formatAnnouncementDate(announcement.publishDate)}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-[11px] font-medium leading-5 text-foreground">
                    {summarizeAnnouncement(announcement.content)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="min-h-[320px] max-h-[58vh] overflow-y-auto px-6 py-5">
            {selected && (
              <article>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                      TYPE_META[selected.type].badgeClass,
                    )}
                  >
                    {TYPE_META[selected.type].label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatAnnouncementDate(selected.publishDate)}
                  </span>
                </div>
                <div className="whitespace-pre-wrap break-words text-[12.5px] leading-6 text-foreground/90">
                  {announcementToPlainText(selected.content)}
                </div>
                {selected.extra && (
                  <div className="mt-5 rounded-xl border border-border-default bg-muted/25 px-4 py-3 text-[11px] leading-5 text-muted-foreground">
                    {announcementToPlainText(selected.extra)}
                  </div>
                )}
              </article>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PlatformAnnouncementCenter() {
  const query = useYuanhengAnnouncements();
  const announcements = useMemo(
    () => query.data?.announcements ?? [],
    [query.data?.announcements],
  );
  const latest = announcements[0];
  const latestIdentity = latest ? getAnnouncementIdentity(latest) : null;
  const [dismissedIdentity, setDismissedIdentity] = useState<string | null>(
    () => localStorage.getItem(DISMISSED_ANNOUNCEMENT_KEY),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const isUnread = Boolean(
    latestIdentity && latestIdentity !== dismissedIdentity,
  );

  const dismissLatest = () => {
    if (!latestIdentity) return;
    localStorage.setItem(DISMISSED_ANNOUNCEMENT_KEY, latestIdentity);
    setDismissedIdentity(latestIdentity);
  };

  if (query.isLoading) {
    return (
      <div className="flex min-h-10 items-center gap-2.5 rounded-xl border border-border-default bg-card/70 px-3.5 py-2 text-[11px] text-muted-foreground">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        <span>正在同步平台公告…</span>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex min-h-10 items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2 text-[11px] text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1">平台公告暂时同步失败</span>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium hover:bg-amber-500/10"
        >
          <RefreshCw className="h-3 w-3" />
          重试
        </button>
      </div>
    );
  }

  if (!query.data?.enabled || !latest) {
    return (
      <div className="flex min-h-10 items-center gap-2.5 rounded-xl border border-border-default bg-card/70 px-3.5 py-2 text-[11px] text-muted-foreground">
        <Megaphone className="h-3.5 w-3.5" />
        <span>平台公告</span>
        <span className="h-3 w-px bg-border-default" />
        <span>已同步，暂无公告</span>
      </div>
    );
  }

  const meta = TYPE_META[latest.type];
  const Icon = meta.icon;

  return (
    <>
      <div
        className={cn(
          "flex min-h-10 animate-rise-in items-center gap-2.5 rounded-xl border px-3.5 py-2 text-[11px]",
          isUnread
            ? meta.bannerClass
            : "border-border-default bg-card/70 text-muted-foreground",
        )}
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            isUnread ? meta.iconClass : "text-muted-foreground",
          )}
        />
        <span className="shrink-0 font-semibold">
          {isUnread ? meta.label : "平台公告"}
        </span>
        <span className="h-3 w-px shrink-0 bg-current opacity-20" />
        <span className="min-w-0 flex-1 truncate">
          {isUnread
            ? summarizeAnnouncement(latest.content)
            : `已同步 ${announcements.length} 条公告`}
        </span>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 font-semibold transition-colors hover:bg-current/5"
        >
          {isUnread ? "查看详情" : "查看历史"}
          <ChevronRight className="h-3 w-3" />
        </button>
        {isUnread && (
          <button
            type="button"
            onClick={dismissLatest}
            aria-label="标记最新公告为已读"
            className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <AnnouncementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        announcements={announcements}
        initialAnnouncementId={latest.id}
      />
    </>
  );
}
