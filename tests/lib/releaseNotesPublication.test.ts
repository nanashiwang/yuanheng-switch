import { describe, expect, it } from "vitest";
import {
  applyReleaseNotes,
  validateReleaseNotes,
} from "../../scripts/release-notes.mjs";

const releases = ["0.1.45", "0.1.44"].map((version) => ({
  version,
  publishedAt: "2026-09-06T00:00:00Z",
  content: `【元衡客户端 v${version}】\n修复问题并改善体验，这是一条给用户看的更新公告。`,
}));
const feed = { schemaVersion: 1, releases };

describe("发布公告同步", () => {
  it("同步本版正文与两版公告，保留下载地址、签名及其他清单字段", () => {
    const platforms = {
      "windows-x86_64": {
        url: "https://example.test/setup.exe",
        signature: "signed",
      },
    };
    const manifest = {
      version: "0.1.45",
      notes: "generic",
      platforms,
      pub_date: "2026-09-06",
    };
    const result = applyReleaseNotes(manifest, feed);
    expect(result.notes).toBe(releases[0].content);
    expect(result.release_notes).toEqual(releases);
    expect(result.platforms).toBe(platforms);
    expect(result.pub_date).toBe(manifest.pub_date);
    expect(manifest.notes).toBe("generic");
  });

  it("未写本版、超过两版、缺少前一版、重复和空公告都阻止发布", () => {
    for (const invalid of [
      { ...feed, releases: releases.slice(0, 1) },
      {
        ...feed,
        releases: [...releases, { ...releases[0], version: "0.1.43" }],
      },
      { ...feed, releases: [releases[0], releases[0]] },
      { ...feed, releases: [{ ...releases[0], content: "" }, releases[1]] },
      { ...feed, releases: [...releases].reverse() },
    ]) {
      expect(() => validateReleaseNotes(invalid, "0.1.45")).toThrow();
    }
    expect(() => validateReleaseNotes(feed, "0.1.46")).toThrow(/先编写/);
  });
});
