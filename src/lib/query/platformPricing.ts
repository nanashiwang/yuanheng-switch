import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usageKeys } from "./usage";

export interface PlatformPriceBook {
  fetchedAt: number;
  symbol: string;
  displayRate: string;
  quotaPerUnit: string;
  selectedGroup: string | null;
  stale: boolean;
  syncError: string | null;
  groups: Record<string, string>;
  models: Record<
    string,
    {
      model_name: string;
      quota_type: number;
      billing_mode?: string;
      billing_expr?: string;
      model_ratio?: number;
      completion_ratio?: number;
      model_price?: number;
      audio_duration_price?: number;
      enable_groups: string[];
    }
  >;
}

export const platformPricingKey = ["yuanheng", "platform-pricing"] as const;
export function usePlatformPricing() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: platformPricingKey,
    queryFn: () =>
      invoke<PlatformPriceBook>("get_platform_pricing", { force: false }),
    staleTime: 6 * 60 * 60 * 1000,
    refetchInterval: 6 * 60 * 60 * 1000,
    retry: false,
  });
  useEffect(() => {
    if (query.dataUpdatedAt)
      void client.invalidateQueries({ queryKey: usageKeys.all });
  }, [client, query.dataUpdatedAt]);
  return query;
}

export function useRefreshPlatformPricing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      invoke<PlatformPriceBook>("get_platform_pricing", { force: true }),
    onSuccess: (book) => {
      client.setQueryData(platformPricingKey, book);
      void client.invalidateQueries({ queryKey: usageKeys.all });
    },
  });
}

export function usePlatformQuoteGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (group: string | null) =>
      invoke("set_platform_quote_group", { group }),
    onSuccess: (_, group) => {
      client.setQueryData<PlatformPriceBook>(platformPricingKey, (book) =>
        book ? { ...book, selectedGroup: group } : book,
      );
      void client.invalidateQueries({ queryKey: usageKeys.all });
    },
  });
}
