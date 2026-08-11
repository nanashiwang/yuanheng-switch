import { useRef, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import {
  isYuanhengCliTool,
  settingsApi,
  type YuanhengToolId,
  YUANHENG_CLI_TOOLS,
  yuanhengApi,
} from "@/lib/api";
import { dt } from "./desktopI18n";

const queryKey = (app: YuanhengToolId) => ["desktop", "tool-launch-cwd", app];

export const launchDirectoryLabel = (path?: string | null) => {
  if (!path) return dt("用户主目录");
  const trimmed = path.replace(/[\\/]+$/, "");
  return trimmed.split(/[\\/]/).pop() || path;
};

export function useToolLaunchDirectories(enabled = true) {
  const queryClient = useQueryClient();
  const [pendingApps, setPendingApps] = useState<Set<YuanhengToolId>>(
    () => new Set(),
  );
  const pendingAppsRef = useRef<Set<YuanhengToolId>>(new Set());
  const queries = useQueries({
    queries: YUANHENG_CLI_TOOLS.map((app) => ({
      queryKey: queryKey(app),
      queryFn: () => yuanhengApi.getLaunchDirectory(app),
      enabled,
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    })),
  });
  const directories = Object.fromEntries(
    YUANHENG_CLI_TOOLS.flatMap((app, index) => {
      const directory = queries[index]?.data;
      return directory ? [[app, directory]] : [];
    }),
  ) as Partial<Record<YuanhengToolId, string>>;

  const chooseDirectory = async (
    app: YuanhengToolId,
  ): Promise<string | null> => {
    if (!isYuanhengCliTool(app) || pendingAppsRef.current.has(app)) return null;
    pendingAppsRef.current.add(app);
    setPendingApps((current) => new Set(current).add(app));
    try {
      const selected = await settingsApi.pickDirectory(directories[app]);
      if (!selected) return null;
      const saved = await yuanhengApi.setLaunchDirectory(app, selected);
      queryClient.setQueryData(queryKey(app), saved);
      return saved;
    } finally {
      pendingAppsRef.current.delete(app);
      setPendingApps((current) => {
        const next = new Set(current);
        next.delete(app);
        return next;
      });
    }
  };

  return { directories, pendingApps, chooseDirectory };
}
