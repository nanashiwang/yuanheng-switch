import type { AppId, YuanhengToolId } from "@/lib/api";
import { APP_ICON_MAP } from "./appConfig";

export const DESKTOP_TOOLS: YuanhengToolId[] = [
  "claude",
  "claude-desktop",
  "codex",
  "chatgpt-desktop",
  "workbuddy",
  "gemini",
  "grokbuild",
  "opencode",
  "openclaw",
  "hermes",
];

export const isCoreApp = (app: YuanhengToolId): app is AppId =>
  app !== "chatgpt-desktop" && app !== "workbuddy";

export const isDesktopApp = (app: YuanhengToolId) =>
  app === "claude-desktop" || app === "chatgpt-desktop" || app === "workbuddy";

export const toolLabel = (app: YuanhengToolId) => {
  if (app === "chatgpt-desktop") return "Codex Desktop";
  if (app === "workbuddy") return "WorkBuddy";
  return APP_ICON_MAP[app].label;
};

export const toolIcon = (app: YuanhengToolId): string =>
  app === "codex" || app === "chatgpt-desktop"
    ? "openai"
    : app === "claude-desktop"
      ? "claude"
      : app;
