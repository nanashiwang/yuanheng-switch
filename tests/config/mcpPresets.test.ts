import { describe, expect, it } from "vitest";
import { mcpPresets } from "@/config/mcpPresets";

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
});
