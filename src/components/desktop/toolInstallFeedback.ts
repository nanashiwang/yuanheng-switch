import { toast } from "sonner";
import { settingsApi } from "@/lib/api/settings";
import { extractErrorMessage } from "@/utils/errorUtils";
import { dt } from "./desktopI18n";
import type { ToolLifecyclePhase } from "@/lib/toolLifecycleState";

export function toolInstallLabel(phase?: ToolLifecyclePhase) {
  return phase === "verifying" ? dt("正在验证安装…") : dt("正在安装，请稍候…");
}

export function showToolInstallError(error: unknown) {
  const message = extractErrorMessage(error) || dt("安装失败");
  const needsNode = message.includes("[NODE_RUNTIME_REQUIRED]");
  toast.error(message.replace("[NODE_RUNTIME_REQUIRED]", "").trim(), {
    duration: needsNode ? 15_000 : 8_000,
    action: needsNode
      ? {
          label: dt("下载 Node.js LTS"),
          onClick: () => {
            void settingsApi
              .openExternal("https://nodejs.org/en/download")
              .catch(() => {
                toast.error(dt("无法打开下载页，请手动访问 nodejs.org"));
              });
          },
        }
      : undefined,
  });
}
