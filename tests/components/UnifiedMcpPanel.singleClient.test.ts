import { describe, expect, it } from "vitest";
import { findSingleClientConflict } from "@/components/mcp/UnifiedMcpPanel";
import type { McpServer } from "@/types";

const server = (singleClient: boolean): McpServer => ({
  id: "blender-mcp",
  name: "Blender MCP",
  server: { command: "uvx", args: ["blender-mcp"] },
  apps: {
    claude: true,
    codex: false,
    gemini: false,
    opencode: false,
    openclaw: false,
    hermes: false,
  },
  tags: singleClient ? ["single-client"] : [],
});

describe("single-client MCP guard", () => {
  it("blocks a second Agent while allowing the active Agent to turn off", () => {
    expect(findSingleClientConflict(server(true), "codex")).toBe("claude");
    expect(findSingleClientConflict(server(true), "claude")).toBeUndefined();
  });

  it("does not restrict ordinary MCP servers", () => {
    expect(findSingleClientConflict(server(false), "codex")).toBeUndefined();
  });
});
