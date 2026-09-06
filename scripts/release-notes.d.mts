interface ReleaseNote {
  version: string;
  publishedAt: string;
  content: string;
}
export function validateReleaseNotes(
  feed: unknown,
  currentVersion: string,
): ReleaseNote[];
export function loadReleaseNotes(currentVersion: string): ReleaseNote[];
export function applyReleaseNotes<T extends { version: string }>(
  manifest: T,
  feed: unknown,
): T & { notes: string; release_notes: ReleaseNote[] };
