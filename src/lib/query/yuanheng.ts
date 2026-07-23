import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { yuanhengApi } from "@/lib/api";
import type { YuanhengReasoningLevel, YuanhengToolId } from "@/lib/api";

export const yuanhengKeys = {
  connection: ["yuanheng", "connection"] as const,
  tools: ["yuanheng", "tools"] as const,
  diagnostics: ["yuanheng", "diagnostics"] as const,
};

export function useYuanhengConnection() {
  return useQuery({
    queryKey: yuanhengKeys.connection,
    queryFn: () => yuanhengApi.getConnection(),
    retry: false,
  });
}

export function useLoginYuanheng() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      username,
      password,
    }: {
      username: string;
      password: string;
    }) => yuanhengApi.login(username, password),
    onSuccess: (result) => {
      if (result.connection) {
        queryClient.setQueryData(yuanhengKeys.connection, result.connection);
        queryClient.invalidateQueries({ queryKey: yuanhengKeys.tools });
        queryClient.invalidateQueries({ queryKey: yuanhengKeys.diagnostics });
      }
    },
  });
}

export function useRegisterYuanheng() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      username,
      password,
    }: {
      username: string;
      password: string;
    }) => yuanhengApi.register(username, password),
    onSuccess: (result) => {
      if (result.connection) {
        queryClient.setQueryData(yuanhengKeys.connection, result.connection);
        queryClient.invalidateQueries({ queryKey: yuanhengKeys.tools });
        queryClient.invalidateQueries({ queryKey: yuanhengKeys.diagnostics });
      }
    },
  });
}

export function useVerifyYuanhengTwoFactor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => yuanhengApi.verifyTwoFactor(code),
    onSuccess: (result) => {
      if (result.connection) {
        queryClient.setQueryData(yuanhengKeys.connection, result.connection);
        queryClient.invalidateQueries({ queryKey: yuanhengKeys.tools });
        queryClient.invalidateQueries({ queryKey: yuanhengKeys.diagnostics });
      }
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
      queryClient.invalidateQueries({ queryKey: yuanhengKeys.diagnostics });
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
      queryClient.invalidateQueries({ queryKey: yuanhengKeys.diagnostics });
    },
  });
}

export function useYuanhengToolStatuses() {
  return useQuery({
    queryKey: yuanhengKeys.tools,
    queryFn: () => yuanhengApi.getToolStatuses(),
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useYuanhengDiagnostics() {
  return useQuery({
    queryKey: yuanhengKeys.diagnostics,
    queryFn: () => yuanhengApi.getDiagnostics(),
    retry: false,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useRepairYuanheng() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const connection = await yuanhengApi.refresh();
      const statuses = await yuanhengApi.getToolStatuses();
      const apps = statuses
        .filter((item) => item.needsUpdate)
        .map((item) => item.app);
      if (apps.length > 0) await yuanhengApi.configureTools(apps);
      return { connection, repairedTools: apps };
    },
    onSuccess: ({ connection }) => {
      queryClient.setQueryData(yuanhengKeys.connection, connection);
      queryClient.invalidateQueries({ queryKey: yuanhengKeys.tools });
      queryClient.invalidateQueries({ queryKey: yuanhengKeys.diagnostics });
    },
  });
}

export function useRotateYuanhengCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const connection = await yuanhengApi.rotateDeviceToken();
      const statuses = await yuanhengApi.getToolStatuses();
      const apps = statuses
        .filter((item) => item.needsUpdate)
        .map((item) => item.app);
      if (apps.length > 0) await yuanhengApi.configureTools(apps);
      return { connection, updatedTools: apps };
    },
    onSuccess: ({ connection }) => {
      queryClient.setQueryData(yuanhengKeys.connection, connection);
      queryClient.invalidateQueries({ queryKey: yuanhengKeys.tools });
      queryClient.invalidateQueries({ queryKey: yuanhengKeys.diagnostics });
    },
  });
}

export function useConfigureYuanhengTools() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      apps,
      models,
      groups,
      reasoning,
    }: {
      apps: YuanhengToolId[];
      models?: Partial<Record<YuanhengToolId, string>>;
      groups?: Partial<Record<YuanhengToolId, string>>;
      reasoning?: Partial<Record<YuanhengToolId, YuanhengReasoningLevel>>;
    }) => yuanhengApi.configureTools(apps, models, groups, reasoning),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: yuanhengKeys.tools });
      queryClient.invalidateQueries({ queryKey: yuanhengKeys.diagnostics });
      queryClient.invalidateQueries({
        queryKey: ["desktop", "tool-connections"],
      });
    },
  });
}
