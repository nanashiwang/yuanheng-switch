import { describe, expect, it } from "vitest";
import {
  BLENDER_DOWNLOAD_URL,
  BLENDER_MCP_ADDON_INSTALL_COMMAND,
  BLENDER_MCP_UV_INSTALL_COMMANDS,
  BLENDER_MCP_VERSION,
  UV_INSTALLATION_DOCS_URL,
  mcpPresets,
} from "@/config/mcpPresets";

describe("MCP presets", () => {
  it("ships Blender MCP disabled with safe defaults", () => {
    const preset = mcpPresets.find((item) => item.id === "blender-mcp");

    expect(preset).toBeDefined();
    expect(preset?.docs).toBe("https://github.com/ahujasid/blender-mcp");
    expect(preset?.tags).toContain("single-client");
    expect(preset?.server.args).toEqual(
      expect.arrayContaining(["--python", "3.11", "blender-mcp==1.9.1"]),
    );
    expect(preset?.server.env).toMatchObject({
      UV_PYTHON_PREFERENCE: "only-managed",
      BLENDER_MCP_SAFE_MODE: "1",
      DISABLE_TELEMETRY: "true",
    });
    expect(Object.values(preset?.apps ?? {})).not.toContain(true);
  });

  it("keeps beginner install commands pinned and on trusted sources", () => {
    expect(new URL(BLENDER_DOWNLOAD_URL).hostname).toBe("www.blender.org");
    expect(new URL(UV_INSTALLATION_DOCS_URL).hostname).toBe("docs.astral.sh");
    expect(BLENDER_MCP_UV_INSTALL_COMMANDS.windows).toContain(
      "https://astral.sh/uv/install.ps1",
    );
    expect(BLENDER_MCP_UV_INSTALL_COMMANDS.macos).toBe("brew install uv");
    expect(BLENDER_MCP_ADDON_INSTALL_COMMAND).toBe(
      `uvx --python 3.11 blender-mcp==${BLENDER_MCP_VERSION} install-addon`,
    );
    expect(BLENDER_MCP_ADDON_INSTALL_COMMAND).not.toMatch(
      /\b(blender-mcp|uvx)\s*$/,
    );
  });
});
