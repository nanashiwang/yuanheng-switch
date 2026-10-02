import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("Claude workspace privilege boundary source contract", () => {
  it("uses only the OS servicing binary, fixed feature and no reboot", () => {
    const source = readFileSync(
      "src-tauri/src/commands/claude_workspace_setup.rs",
      "utf8",
    );
    expect(source).toContain("GetSystemDirectoryW");
    expect(source).toContain('root.join("dism.exe")');
    expect(source).toContain('wide("runas")');
    expect(source).toContain(
      "/Online /Enable-Feature /FeatureName:VirtualMachinePlatform /All /NoRestart",
    );
    for (const forbidden of [
      "TerminateProcess",
      "taskkill",
      "shutdown.exe",
      "ExecutionPolicy",
      "Invoke-WebRequest",
      "CheckNetIsolation",
      "Set-NetFirewall",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain("if !confirmed");
    expect(source).toContain("deny_unknown_fields");
  });
  it("all shared API entrypoints and the desktop download hook use preparation", () => {
    const api = readFileSync("src/lib/api/yuanheng.ts", "utf8");
    expect(api).toContain(
      'if (app === "claude-desktop") await ensureClaudeWorkspaceReady()',
    );
    expect(api).toContain('item.app === "claude-desktop" && item.configured');
    const launch = readFileSync("src-tauri/src/commands/misc.rs", "utf8");
    expect(launch).toContain(
      "crate::commands::ensure_workspace_ready().await?",
    );
    expect(
      readFileSync("src/components/desktop/useDesktopInstallFlow.ts", "utf8"),
    ).toContain(
      "await observe(ensureClaudeWorkspaceReady(), controller.signal)",
    );
  });
});
