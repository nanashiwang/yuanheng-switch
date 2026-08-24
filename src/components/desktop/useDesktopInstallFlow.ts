import { useEffect, useRef, useState } from "react";

import { settingsApi } from "@/lib/api";
import type { ToolVersionInfo } from "@/lib/api/settings";
import type { YuanhengToolId } from "@/lib/api/yuanheng";

const OFFICIAL_DOWNLOAD_HOSTS = new Set([
  "claude.ai",
  "openai.com",
  "www.openai.com",
  "codebuddy.cn",
  "www.codebuddy.cn",
]);
const POLL_INTERVAL_MS = 3_000;
const INSTALL_MONITOR_TIMEOUT_MS = 5 * 60_000;

const wait = (duration: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, duration));

function assertOfficialDownloadUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || !OFFICIAL_DOWNLOAD_HOSTS.has(url.hostname)) {
    throw new Error("下载地址不是受信任的官方 HTTPS 域名");
  }
}

export type DesktopInstallMonitorResult =
  | { status: "detected"; tool: ToolVersionInfo }
  | { status: "timeout" }
  | { status: "cancelled" };

/**
 * 打开官方安装入口后，以低频本机探测等待安装完成。
 * 不自动执行下载文件；检测到应用后由调用方继续配置和验证。
 */
export function useDesktopInstallFlow() {
  const [monitoringApps, setMonitoringApps] = useState<Set<YuanhengToolId>>(
    () => new Set(),
  );
  const generations = useRef(new Map<YuanhengToolId, number>());

  useEffect(
    () => () => {
      for (const app of generations.current.keys()) {
        generations.current.set(app, (generations.current.get(app) ?? 0) + 1);
      }
    },
    [],
  );

  const stop = (app: YuanhengToolId) => {
    generations.current.set(app, (generations.current.get(app) ?? 0) + 1);
    setMonitoringApps((current) => {
      const next = new Set(current);
      next.delete(app);
      return next;
    });
  };

  const openAndMonitor = async (
    app: YuanhengToolId,
    versionTarget: string,
    downloadUrl: string,
  ): Promise<DesktopInstallMonitorResult> => {
    assertOfficialDownloadUrl(downloadUrl);
    const generation = (generations.current.get(app) ?? 0) + 1;
    generations.current.set(app, generation);
    setMonitoringApps((current) => new Set(current).add(app));
    await settingsApi.openExternal(downloadUrl);

    const deadline = Date.now() + INSTALL_MONITOR_TIMEOUT_MS;
    try {
      while (Date.now() < deadline) {
        if (generations.current.get(app) !== generation) {
          return { status: "cancelled" };
        }
        const [tool] = await settingsApi.getInstalledToolVersions([
          versionTarget,
        ]);
        if (tool?.version || tool?.install_path) {
          return { status: "detected", tool };
        }
        await wait(POLL_INTERVAL_MS);
      }
      return { status: "timeout" };
    } finally {
      if (generations.current.get(app) === generation) {
        setMonitoringApps((current) => {
          const next = new Set(current);
          next.delete(app);
          return next;
        });
      }
    }
  };

  return { monitoringApps, openAndMonitor, stop };
}
