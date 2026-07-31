import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  announcementToPlainText,
  PlatformAnnouncementCenter,
  summarizeAnnouncement,
} from "@/components/desktop/PlatformAnnouncementCenter";
import { setYuanhengAnnouncements } from "../msw/state";
import { createTestQueryClient } from "../utils/testQueryClient";

function renderCenter() {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <PlatformAnnouncementCenter />
    </QueryClientProvider>,
  );
}

describe("PlatformAnnouncementCenter", () => {
  beforeEach(() => {
    localStorage.removeItem("yuanheng.dashboard.announcement-dismissed.v2");
  });

  it("清理平台 Markdown 和旧版 HTML 后生成摘要", () => {
    expect(
      summarizeAnnouncement(
        "【分组调整】\n\n- `vip` 改为 **OpenAI · 优质**\n- 旧令牌需手动修改",
      ),
    ).toBe("【分组调整】 · • vip 改为 OpenAI · 优质");
    expect(
      announcementToPlainText(
        "<style>.notice{color:red}</style><h1>平台公告</h1><p>服务已恢复。</p>",
      ),
    ).toBe("平台公告\n服务已恢复。");
  });

  it("无需登录即可展示平台最新公告并查看历史", async () => {
    setYuanhengAnnouncements({
      enabled: true,
      source: "platform",
      announcements: [
        {
          id: "34",
          content:
            "【平台分组名称调整说明】\n\n历史令牌仍显示旧分组，需要手动修改。",
          extra: "以创建令牌页面实时显示为准。",
          publishDate: "2026-07-28T02:41:25.745Z",
          type: "warning",
        },
        {
          id: "33",
          content: "【Grok 4.5 模型上线公告】\n\n模型现已正式上线。",
          extra: null,
          publishDate: "2026-07-26T17:31:00.956Z",
          type: "success",
        },
      ],
    });

    renderCenter();

    expect(await screen.findByText("重要提醒")).toBeInTheDocument();
    expect(
      screen.getByText(
        "【平台分组名称调整说明】 · 历史令牌仍显示旧分组，需要手动修改。",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /查看详情/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText("与元衡平台公告中心同步，每分钟自动检查更新"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("以创建令牌页面实时显示为准。"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Grok 4\.5 模型上线公告/));
    expect(
      screen.getByText("【Grok 4.5 模型上线公告】 模型现已正式上线。"),
    ).toBeInTheDocument();
  });

  it("标记已读后保留公告中心入口", async () => {
    setYuanhengAnnouncements({
      enabled: true,
      source: "platform",
      announcements: [
        {
          id: "34",
          content: "平台公告内容",
          extra: null,
          publishDate: "2026-07-28T02:41:25.745Z",
          type: "default",
        },
      ],
    });

    renderCenter();
    await screen.findByText("平台公告内容");
    fireEvent.click(screen.getByRole("button", { name: "标记最新公告为已读" }));

    expect(screen.getByText("已同步 1 条公告")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /查看历史/ }),
    ).toBeInTheDocument();
  });
});
