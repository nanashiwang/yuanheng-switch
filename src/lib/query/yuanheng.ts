import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { yuanhengApi } from "@/lib/api";

export const yuanhengKeys = {
  connection: ["yuanheng", "connection"] as const,
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
    },
  });
}

export function useRefreshYuanheng() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => yuanhengApi.refresh(),
    onSuccess: (status) => {
      queryClient.setQueryData(yuanhengKeys.connection, status);
    },
  });
}

export function useDisconnectYuanheng() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => yuanhengApi.disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: yuanhengKeys.connection });
    },
  });
}
