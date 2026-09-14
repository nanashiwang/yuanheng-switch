import type {
  YuanhengConnectionStatus,
  YuanhengReasoningLevel,
  YuanhengToolStatus,
} from "@/lib/api/yuanheng";

/** Explicit choices survive incomplete catalogs. Live preflight validates them. */
export function pickPreferredGroup(
  connection: YuanhengConnectionStatus | undefined,
  model: string,
  current?: string,
): string | undefined {
  if (current) return current;
  if (!connection) return undefined;
  const available = connection.modelGroups[model] ?? [];
  if (available.includes("auto")) return "auto";
  const accountGroup = connection.account?.group;
  if (accountGroup && available.includes(accountGroup)) return accountGroup;
  const ratioOf = (id: string) =>
    connection.groups.find((group) => group.id === id)?.ratio ?? Infinity;
  return [...available].sort(
    (left, right) =>
      ratioOf(left) - ratioOf(right) || left.localeCompare(right),
  )[0];
}

export interface ToolSetupDraft {
  model?: string;
  group?: string;
  reasoning?: YuanhengReasoningLevel;
}

export function resolveToolSetupSelection(
  connection: YuanhengConnectionStatus | undefined,
  status: YuanhengToolStatus | undefined,
  draft: ToolSetupDraft,
): ToolSetupDraft {
  // Never guess while the saved status is still loading.
  if (!status) return {};
  const model =
    draft.model ?? status.model ?? status.recommendedModel ?? undefined;
  const existing = Boolean(
    status.model || status.configured || status.needsUpdate,
  );
  const group =
    draft.group ??
    status.group ??
    (!existing && model ? pickPreferredGroup(connection, model) : undefined);
  return {
    model,
    group,
    reasoning: draft.reasoning ?? status.reasoning ?? "auto",
  };
}
