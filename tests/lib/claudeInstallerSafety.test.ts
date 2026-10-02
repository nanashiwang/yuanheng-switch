import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  "src-tauri/scripts/install-claude-windows.ps1",
  "utf8",
);
describe("shared Claude installer safety contract", () => {
  it("checks response and parses syntax before execution without printing raw exceptions", () => {
    expect(script).toContain("Invoke-WebRequest");
    expect(script).toContain(
      "-UseBasicParsing -TimeoutSec 60 -MaximumRedirection 5",
    );
    expect(script).toContain("$finalUri.Scheme -ne 'https'");
    expect(script).toContain("$httpStatus -ne 200");
    expect(script).toContain("$content.Length -gt 1048576");
    expect(script.indexOf("Parser]::ParseInput")).toBeLessThan(
      script.indexOf("& $installer"),
    );
    expect(
      script.indexOf("throw 'Installer endpoint returned a document'"),
    ).toBeLessThan(script.indexOf("[scriptblock]::Create"));
    expect(script).not.toMatch(/Write-Error\s+\$_|WriteLine\(\$_/);
    expect(script).not.toContain("Bypass");
  });
  it("copy instructions and backend use exactly the same checked script", () => {
    const backend = readFileSync("src-tauri/src/commands/misc.rs", "utf8");
    const about = readFileSync(
      "src/components/settings/AboutSection.tsx",
      "utf8",
    );
    expect(backend).toContain(
      'include_str!("../../scripts/install-claude-windows.ps1")',
    );
    expect(about).toContain("install-claude-windows.ps1?raw");
    expect(about).toContain("powershellEncodedCommand(claudeWindowsInstaller)");
    expect(about).not.toContain("irm https://claude.ai/install.ps1 | iex");
  });
});
