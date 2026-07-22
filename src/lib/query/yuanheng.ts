import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { yuanhengApi } from "@/lib/api";
import type { AppId } from "@/lib/api";

export const yuanhengKeys = {
  connection: ["yuanheng", "connection"] as const,
  tools: ["yuanheng", "tools"] as const,
};

export function useYuanhengConnection() {
  return useQuery({
    queryKey: yuanhengKeys.connection,
    queryFn: () => yuanhengApi.getConnection(),
    retry: false,
  });
}

export function useConnectYuanheng() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      accessToken,
      userId,
    }: {
      accessToken: string;
      userId: string;
    }) => yuanhengApi.connect(accessToken, userId),
    onSuccess: (status) => {
      queryClient.setQueryData(yuanhengKeys.connection, status);
      queryClient.invalidateQueries({ queryKey: yuanhengKeys.tools });
    },
  });
}

export function useRefreshYuanheng() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => yuanhengApi.refresh(),
    onSuccess: (status) => {
      queryClient.setQueryData(yuanhengKeys.connection, status);
      queryClient.invalidateQueries({ queryKey: yuanhengKeys.tools });
    },
  });
}

export function useDisconnectYuanheng() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => yuanhengApi.disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: yuanhengKeys.connection });
      queryClient.invalidateQueries({ queryKey: yuanhengKeys.tools });
    },
  });
}

export function useYuanhengToolStatuses() {
  return useQuery({
    queryKey: yuanhengKeys.tools,
    queryFn: () => yuanhengApi.getToolStatuses(),
    retry: false,
  });
}

export function useConfigureYuanhengTools() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      apps,
      models,
    }: {
      apps: AppId[];
      models?: Partial<Record<AppId, string>>;
    }) => yuanhengApi.configureTools(apps, models),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: yuanhengKeys.tools });
      queryClient.invalidateQueries({
        queryKey: ["desktop", "tool-connections"],
      });
    },
  });
}
