import bundledFeed from "@/data/desktop-release-notes.json";

export interface DesktopReleaseNote {
  version: string;
  publishedAt: string;
  content: string;
}

export const RELEASE_NOTES_CACHE_KEY = "yuanheng.release-notes.v1";
export const RELEASE_NOTES_SEEN_KEY = "yuanheng.release-notes.seen.v1";
export const RELEASE_NOTES_LIMIT = 2;
const MAX_CONTENT_LENGTH = 12_000;
const MAX_CACHE_LENGTH = 64_000;
const VERSION_PATTERN =
  /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;

export function compareReleaseVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** Validate first, sort numerically, deduplicate, then cap every input at two. */
export function normalizeReleaseNotes(value: unknown): DesktopReleaseNote[] {
  if (!Array.isArray(value) || value.length > 100) return [];
  const versions = new Map<string, DesktopReleaseNote>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { version, publishedAt, content } = item;
    if (
      typeof version !== "string" ||
      !VERSION_PATTERN.test(version) ||
      typeof publishedAt !== "string" ||
      publishedAt.length > 40 ||
      !/^\d{4}-\d{2}-\d{2}T/.test(publishedAt) ||
      !Number.isFinite(Date.parse(publishedAt)) ||
      typeof content !== "string" ||
      !content.trim() ||
      content.length > MAX_CONTENT_LENGTH ||
      versions.has(version)
    ) {
      continue;
    }
    versions.set(version, { version, publishedAt, content: content.trim() });
  }
  return [...versions.values()]
    .sort((a, b) => compareReleaseVersions(b.version, a.version))
    .slice(0, RELEASE_NOTES_LIMIT);
}

export function bundledReleaseNotes(): DesktopReleaseNote[] {
  return normalizeReleaseNotes(bundledFeed.releases);
}

export function saveReleaseNotes(notes: DesktopReleaseNote[]): void {
  try {
    localStorage.setItem(
      RELEASE_NOTES_CACHE_KEY,
      JSON.stringify(normalizeReleaseNotes(notes)),
    );
  } catch {
    // Storage disabled/full must never block the workspace or announcement view.
  }
}

export function loadReleaseNotes(): DesktopReleaseNote[] {
  let cached: DesktopReleaseNote[] = [];
  try {
    const raw = localStorage.getItem(RELEASE_NOTES_CACHE_KEY);
    if (raw && raw.length <= MAX_CACHE_LENGTH) {
      cached = normalizeReleaseNotes(JSON.parse(raw));
    }
  } catch {
    // Invalid/oversized cache is replaced with the two bundled entries.
  }
  const notes = normalizeReleaseNotes([...cached, ...bundledReleaseNotes()]);
  saveReleaseNotes(notes);
  return notes;
}

export function selectReleaseNotes(
  remote: unknown,
  fallback: DesktopReleaseNote[],
): DesktopReleaseNote[] {
  const releases = normalizeReleaseNotes(remote);
  if (
    !releases.length ||
    (fallback[0] &&
      compareReleaseVersions(releases[0].version, fallback[0].version) < 0)
  ) {
    return normalizeReleaseNotes(fallback);
  }
  // A complete remote feed replaces the cache; never append unbounded history.
  return releases.length === RELEASE_NOTES_LIMIT
    ? releases
    : normalizeReleaseNotes([...releases, ...fallback]);
}

export function releaseNoteIdentity(note: DesktopReleaseNote): string {
  let hash = 2166136261;
  for (const character of note.content) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return `${note.version}:${(hash >>> 0).toString(36)}`;
}
