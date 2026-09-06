import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server";
import {
  RELEASE_NOTES_CACHE_KEY,
  RELEASE_NOTES_SEEN_KEY,
} from "@/lib/desktopReleaseNotes";
import { openAnnouncementCenter } from "@/lib/announcementCenter";
import {
  announcementToPlainText,
  PlatformAnnouncementCenter,
  DesktopAnnouncementCenter,
  summarizeAnnouncement,
} from "@/components/desktop/PlatformAnnouncementCenter";
import { setYuanhengAnnouncements } from "../msw/state";
import { createTestQueryClient } from "../utils/testQueryClient";

function renderCenter() {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <PlatformAnnouncementCenter />
      <DesktopAnnouncementCenter />
    </QueryClientProvider>,
  );
}

describe("PlatformAnnouncementCenter", () => {
  beforeEach(() => {
    localStorage.removeItem("yuanheng.dashboard.announcement-dismissed.v2");
    localStorage.removeItem(RELEASE_NOTES_CACHE_KEY);
    localStorage.removeItem(RELEASE_NOTES_SEEN_KEY);
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

  it("旧清单或已是最新版仍可查看两版公告，不自动弹窗", async () => {
    renderCenter();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看更新内容" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("仅展示最近两次客户端更新，不累计历史记录。"),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByText("v0.1.44")).toHaveLength(2);
    expect(within(dialog).getByText("v0.1.43")).toBeInTheDocument();
    expect(within(dialog).queryByText("v0.1.42")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByText("v0.1.43"));
    expect(
      within(dialog).getByText(/支持在元衡中转与 Codex 官方账号之间切换/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭公告中心" }));
    expect(
      screen.getByRole("button", { name: "查看更新内容" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "标记本次更新已读" }),
    ).not.toBeInTheDocument();
  });

  it("服务端返回更多版本也只展示两次，正文不会执行 HTML 或创建外部链接", async () => {
    server.use(
      http.post("http://tauri.local/get_desktop_release_notes", () =>
        HttpResponse.json(
          ["0.1.46", "0.1.45", "0.1.44"].map((version) => ({
            version,
            publishedAt: "2026-09-06T00:00:00Z",
            content: `公告 ${version}\n<img src="https://evil.test/track"><script>alert(1)</script>`,
          })),
        ),
      ),
    );
    renderCenter();
    await screen.findByText("v0.1.46 更新公告");
    fireEvent.click(screen.getByRole("button", { name: "查看更新内容" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("v0.1.45")).toBeInTheDocument();
    expect(within(dialog).queryByText("v0.1.44")).not.toBeInTheDocument();
    expect(dialog.querySelector("img, script, a")).toBeNull();
    expect(
      JSON.parse(localStorage.getItem(RELEASE_NOTES_CACHE_KEY)!),
    ).toHaveLength(2);
  });

  it("关于和更新弹窗共用内部窗口，网络错误仍展示本地公告", async () => {
    server.use(
      http.post("http://tauri.local/get_desktop_release_notes", () =>
        HttpResponse.json({ error: "offline" }, { status: 503 }),
      ),
    );
    renderCenter();
    act(() => openAnnouncementCenter("updates"));
    expect(
      await screen.findByText("暂时无法同步，正在显示本地保存的最近两次更新。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByText("v0.1.44").length).toBeGreaterThan(0);
  });

  it("已读标记不累计历史，存储写入失败也不会阻止阅读", async () => {
    renderCenter();
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("full");
      });
    try {
      fireEvent.click(screen.getByRole("button", { name: "标记本次更新已读" }));
      expect(
        screen.queryByRole("button", { name: "标记本次更新已读" }),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "查看更新内容" }));
      await waitFor(() =>
        expect(screen.getByRole("dialog")).toBeInTheDocument(),
      );
    } finally {
      write.mockRestore();
    }
  });
});
