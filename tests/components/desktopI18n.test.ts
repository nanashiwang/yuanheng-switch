import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import {
  DESKTOP_EN,
  desktopLocale,
  dt,
} from "@/components/desktop/desktopI18n";
import { DESKTOP_DE } from "@/components/desktop/desktopI18n.de";
import { DESKTOP_ES } from "@/components/desktop/desktopI18n.es";
import { DESKTOP_FR } from "@/components/desktop/desktopI18n.fr";
import { DESKTOP_JA } from "@/components/desktop/desktopI18n.ja";
import { DESKTOP_KO } from "@/components/desktop/desktopI18n.ko";
import { DESKTOP_PT_BR } from "@/components/desktop/desktopI18n.ptBR";
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
    expect(
      dt("统一管理 {{v0}} 的 Skills、MCP、提示词与 Agent 能力。", {
        v0: "Codex",
      }),
    ).toBe("統一管理 Codex 的技能、MCP、提示詞與代理能力。");
    expect(dt("今日 Tokens")).toBe("今日權杖");
    expect(dt("{{v0}} 个技能 · {{v1}} 个 MCP", { v0: 2, v1: 3 })).toBe(
      "2 個技能 · 3 個 MCP",
    );
  });

  it("日语使用完整的桌面翻译而不是英文回退", async () => {
    await i18n.changeLanguage("ja");

    expect(desktopLocale()).toBe("ja");
    expect(dt("工作台")).toBe("ワークスペース");
    expect(dt("工具管理")).toBe("ツール管理");
    expect(dt("能力中心")).toBe("機能センター");
    expect(dt("会话与用量")).toBe("セッションと使用量");
    expect(dt("快捷控制台")).toBe("クイックコンソール");
    expect(dt("当前模型")).toBe("現在のモデル");
    expect(dt("令牌分组")).toBe("トークングループ");
    expect(dt("一键修复")).toBe("今すぐ修復");
    expect(dt("检测到 3 个工具配置发生变化。")).toBe(
      "3個のツール設定が変更されました。",
    );
  });

  it.each([
    ["ko", "워크스페이스", "현재 모델", "3개 도구가 준비되었습니다."],
    [
      "es",
      "Espacio de trabajo",
      "Modelo actual",
      "3 herramientas están listas.",
    ],
    ["de", "Arbeitsbereich", "Aktuelles Modell", "3 Tools sind bereit."],
    ["fr", "Espace de travail", "Modèle actuel", "3 outils sont prêts."],
    [
      "pt-BR",
      "Espaço de trabalho",
      "Modelo atual",
      "3 ferramentas estão prontas.",
    ],
  ])(
    "%s uses its desktop dictionary instead of English fallback",
    async (language, workspace, currentModel, readyMessage) => {
      await i18n.changeLanguage(language);

      expect(desktopLocale()).toBe(language);
      expect(dt("工作台")).toBe(workspace);
      expect(dt("当前模型")).toBe(currentModel);
      expect(dt("3 个工具已经就绪。")).toBe(readyMessage);
      expect(dt("设置")).not.toBe(DESKTOP_EN["设置"]);
    },
  );

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

  it("日语覆盖全部桌面英文词条", () => {
    expect(Object.keys(DESKTOP_JA).sort()).toEqual(
      Object.keys(DESKTOP_EN).sort(),
    );

    const untranslatedBrandNames = new Set([
      "元衡桌面端",
      "元衡 API",
      "阿里千问",
      "智谱 AI",
      "月之暗面",
      "字节豆包",
      "百度文心",
      "腾讯混元",
      "小米 MiMo",
      "阶跃星辰",
      "美团 LongCat",
    ]);

    for (const [source, english] of Object.entries(DESKTOP_EN)) {
      const placeholders = (text: string) =>
        [...text.matchAll(/\{\{\w+\}\}/g)].map(([value]) => value);

      expect(placeholders(DESKTOP_JA[source]), source).toEqual(
        placeholders(source),
      );
      expect(DESKTOP_JA[source], source).not.toMatch(/\[\[|【|】/);
      if (!untranslatedBrandNames.has(source)) {
        expect(DESKTOP_JA[source], source).not.toBe(english);
      }
    }
  });

  it.each([
    ["ko", DESKTOP_KO],
    ["es", DESKTOP_ES],
    ["de", DESKTOP_DE],
    ["fr", DESKTOP_FR],
    ["pt-BR", DESKTOP_PT_BR],
  ])(
    "%s covers every desktop source and preserves placeholders",
    (_name, dictionary) => {
      expect(Object.keys(dictionary).sort()).toEqual(
        Object.keys(DESKTOP_EN).sort(),
      );

      for (const source of Object.keys(DESKTOP_EN)) {
        const placeholders = (text: string) =>
          [...text.matchAll(/\{\{\w+\}\}/g)].map(([value]) => value).sort();
        expect(placeholders(dictionary[source]), source).toEqual(
          placeholders(source),
        );
      }
    },
  );

  it("繁体中文覆盖全部桌面英文词条", () => {
    expect(Object.keys(DESKTOP_ZH_TW).sort()).toEqual(
      Object.keys(DESKTOP_EN).sort(),
    );
  });

  it("繁体中文导航和常用标签不保留英文占位", () => {
    expect(zhTW.desktop.views.skills).toBe("技能");
    expect(zhTW.desktop.views.prompts).toBe("提示詞");
    expect(zhTW.desktop.views.agents).toBe("代理");
    expect(zhTW.settings.skillStorage.title).toBe("技能儲存位置");
    expect(zhTW.settings.skillSync.title).toBe("技能同步方式");
    expect(zhTW.usage.tokens).toBe("權杖");
    expect(zhTW.workspace.manage).toBe("工作區");
    expect(zhTW.usage.input).toBe("輸入");
    expect(zhTW.usage.output).toBe("輸出");
  });
});
