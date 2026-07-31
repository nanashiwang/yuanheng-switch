import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import {
  DESKTOP_EN,
  desktopLocale,
  dt,
} from "@/components/desktop/desktopI18n";
import { DESKTOP_ZH_TW } from "@/components/desktop/desktopI18n.zhTW";
import zhTW from "@/i18n/locales/zh-TW.json";

const originalLanguage = i18n.language;

afterEach(async () => {
  await i18n.changeLanguage(originalLanguage);
});

describe("desktopI18n", () => {
  it("繁体中文使用完整的桌面翻译而不是英文回退", async () => {
    await i18n.changeLanguage("zh-TW");

    expect(desktopLocale()).toBe("zh-TW");
    expect(dt("账号与余额")).toBe("帳號與餘額");
    expect(dt("当前模型")).toBe("目前模型");
    expect(dt("设置")).toBe("設定");
  });

  it("繁体中文支持动态桌面提示", async () => {
    await i18n.changeLanguage("zh-TW");

    expect(dt("检测到 3 个工具配置发生变化。")).toBe(
      "偵測到 3 個工具設定發生變更。",
    );
    expect(dt("2 个工具已经就绪。")).toBe("2 個工具已就緒。");
  });

  it("简体中文与英文仍使用各自语言", async () => {
    await i18n.changeLanguage("zh-CN");
    expect(dt("账号与余额")).toBe("账号与余额");

    await i18n.changeLanguage("en");
    expect(dt("账号与余额")).toBe("Account & Balance");
  });

  it("繁体中文覆盖全部桌面英文词条", () => {
    expect(Object.keys(DESKTOP_ZH_TW).sort()).toEqual(
      Object.keys(DESKTOP_EN).sort(),
    );
  });

  it("繁体中文导航和常用标签不保留英文占位", () => {
    expect(zhTW.desktop.views.skills).toBe("技能");
    expect(zhTW.desktop.views.prompts).toBe("提示詞");
    expect(zhTW.desktop.views.agents).toBe("代理");
    expect(zhTW.workspace.manage).toBe("工作區");
    expect(zhTW.usage.input).toBe("輸入");
    expect(zhTW.usage.output).toBe("輸出");
  });
});
