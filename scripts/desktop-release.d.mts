export interface ReleaseContext {
  version: string;
  tag: string;
  stable: boolean;
  sha: string;
  runId: string;
  repo: string;
}
export interface AssetInfo {
  name: string;
  size: number;
  sha256: string;
}
export interface Receipt {
  schemaVersion: number;
  version: string;
  sha: string;
  runId: string;
  target: string;
  files: AssetInfo[];
}
export interface ReleasePlan extends ReleaseContext {
  productName: string;
  assets: AssetInfo[];
}
export const TARGETS: string[];
export function releaseContext(
  env: Record<string, string | undefined>,
  version: string,
): ReleaseContext;
export function collectTarget(args: {
  repoRoot: string;
  outputDir: string;
  target: string;
  artifactPaths: string[];
  appVersion: string;
  context: ReleaseContext;
  productName: string;
}): Receipt;
export function assembleRelease(args: {
  inputDir: string;
  outputDir: string;
  context: ReleaseContext;
  productName: string;
  feed: unknown;
}): ReleasePlan;
export function verifyReleaseAssets(
  release: unknown,
  assets: AssetInfo[],
  notes: string,
): void;
export function publishRelease(args: {
  outputDir: string;
  context: ReleaseContext;
  productName?: string;
  gh?: (args: string[]) => string;
}): { draft: boolean; prerelease: boolean; html_url: string };
