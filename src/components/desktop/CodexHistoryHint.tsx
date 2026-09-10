import type { CodexAccountModeStatus } from "@/lib/api/yuanheng";
import { dt } from "./desktopI18n";

export function CodexHistoryHint({
  status,
}: {
  status?: CodexAccountModeStatus;
}) {
  const conflicts = status?.historyConflicts ?? [];
  return (
    <p
      className="mt-1 text-[10px] leading-4 opacity-70"
      role={
        conflicts.length || status?.historyRepairNeeded ? "status" : undefined
      }
    >
      {conflicts.length
        ? dt(
            "历史会话配置与自定义供应商冲突（{{providers}}），已保留原配置，请检查供应商设置。",
            { providers: conflicts.join("、") },
          )
        : status?.historyRepairNeeded
          ? dt("历史会话配置需要修复，请再次点击当前使用方式。")
          : dt(
              "历史对话沿用当前使用方式；旧模型不可用时，请在 Codex 中重新选择模型。",
            )}
    </p>
  );
}
