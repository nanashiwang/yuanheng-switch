import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RELEASE_NOTES_CACHE_KEY,
  bundledReleaseNotes,
  loadReleaseNotes,
  normalizeReleaseNotes,
  saveReleaseNotes,
  selectReleaseNotes,
} from "@/lib/desktopReleaseNotes";

const note = (version: string, content = `版本 ${version} 的更新说明`) => ({
  version,
  publishedAt: "2026-09-06T00:00:00Z",
  content,
});

describe("最近两版更新公告", () => {
  beforeEach(() => localStorage.removeItem(RELEASE_NOTES_CACHE_KEY));
  afterEach(() => vi.restoreAllMocks());

  it("数值排序、去重并严格裁剪两版，不按发布时间或字符串排序", () => {
    expect(
      normalizeReleaseNotes([
        note("0.1.9"),
        note("0.1.100"),
        note("0.1.99"),
        note("0.1.100", "duplicate"),
      ]).map((item) => item.version),
    ).toEqual(["0.1.100", "0.1.99"]);
  });

  it("忽略预发布、错误版本、空内容、错误日期和超大输入", () => {
    expect(
      normalizeReleaseNotes([
        note("0.1.45-beta.1"),
        note("999999999.1.0"),
        note("01.2.3"),
        note("0.1.45", ""),
        note("0.1.45", "x".repeat(12_001)),
        { ...note("0.1.46"), publishedAt: "bad" },
        null,
        "bad",
        note("0.1.44"),
      ]),
    ).toEqual([note("0.1.44")]);
    expect(normalizeReleaseNotes(Array(101).fill(note("1.0.0")))).toEqual([]);
    expect(normalizeReleaseNotes({})).toEqual([]);
  });

  it("缓存也只保存两版，更新时不拼接累计历史", () => {
    const updates = selectReleaseNotes(
      [note("0.1.46"), note("0.1.45"), note("0.1.44")],
      [note("0.1.44"), note("0.1.43")],
    );
    saveReleaseNotes(updates);
    expect(JSON.parse(localStorage.getItem(RELEASE_NOTES_CACHE_KEY)!)).toEqual([
      note("0.1.46"),
      note("0.1.45"),
    ]);
  });

  it("损坏、超大、旧缓存回退并替换为自带两版公告", () => {
    for (const value of [
      "bad json",
      "x".repeat(64_001),
      JSON.stringify([note("0.1.1")]),
    ]) {
      localStorage.setItem(RELEASE_NOTES_CACHE_KEY, value);
      expect(loadReleaseNotes()).toEqual(bundledReleaseNotes());
      expect(
        JSON.parse(localStorage.getItem(RELEASE_NOTES_CACHE_KEY)!),
      ).toHaveLength(2);
    }
  });

  it("旧清单、空清单、临时镜像回退不能清空或降级公告", () => {
    const previous = [note("0.1.46"), note("0.1.45")];
    expect(selectReleaseNotes(null, previous)).toEqual(previous);
    expect(selectReleaseNotes([], previous)).toEqual(previous);
    expect(
      selectReleaseNotes([note("0.1.44"), note("0.1.43")], previous),
    ).toEqual(previous);
    expect(selectReleaseNotes([note("0.1.47")], previous)).toEqual([
      note("0.1.47"),
      note("0.1.46"),
    ]);
  });

  it("本机存储不可用时仍能查看公告", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    expect(loadReleaseNotes()).toEqual(bundledReleaseNotes());
    expect(() => saveReleaseNotes([note("0.1.44")])).not.toThrow();
  });
});
