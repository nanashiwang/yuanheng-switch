import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const versionPattern = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;

function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function validateReleaseNotes(feed, currentVersion) {
  if (
    feed?.schemaVersion !== 1 ||
    !Array.isArray(feed.releases) ||
    feed.releases.length !== 2
  ) {
    throw new Error("更新公告必须只保留最近两版，不能缺失或累计历史");
  }
  const versions = new Set();
  for (const note of feed.releases) {
    if (
      typeof note?.version !== "string" ||
      !versionPattern.test(note.version) ||
      versions.has(note.version) ||
      typeof note.publishedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(note.publishedAt) ||
      !Number.isFinite(Date.parse(note.publishedAt)) ||
      typeof note.content !== "string" ||
      note.content.trim().length < 20 ||
      note.content.length > 12000
    ) {
      throw new Error("更新公告包含无效版本、重复版本、日期或空白内容");
    }
    versions.add(note.version);
  }
  const releases = [...feed.releases].sort((a, b) =>
    compareVersions(b.version, a.version),
  );
  if (
    releases[0].version !== currentVersion ||
    feed.releases[0].version !== currentVersion
  ) {
    throw new Error(`请先编写 v${currentVersion} 的更新公告，并移除最旧一版`);
  }
  return releases.map(({ version, publishedAt, content }) => ({
    version,
    publishedAt,
    content: content.trim(),
  }));
}

export function loadReleaseNotes(currentVersion) {
  const feed = JSON.parse(
    readFileSync(resolve(root, "src/data/desktop-release-notes.json"), "utf8"),
  );
  return validateReleaseNotes(feed, currentVersion);
}

export function applyReleaseNotes(manifest, feed) {
  const releases = validateReleaseNotes(feed, manifest.version);
  // Keep every platform URL/signature untouched. The mirror preserves extra fields.
  return { ...manifest, notes: releases[0].content, release_notes: releases };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const manifestPath = process.argv[2];
  const notesPath = process.argv[3];
  if (!manifestPath || !notesPath) {
    throw new Error(
      "用法：node scripts/release-notes.mjs <latest.json> <notes.txt>",
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const releases = loadReleaseNotes(manifest.version);
  const updated = applyReleaseNotes(manifest, { schemaVersion: 1, releases });
  writeFileSync(manifestPath, `${JSON.stringify(updated, null, 2)}\n`);
  writeFileSync(notesPath, `${updated.notes}\n`);
  console.log(`已同步 v${manifest.version} 公告；只保留最近两版`);
}
