import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  isToolLifecycleBusy,
  runToolLifecycleJob,
  useToolLifecycleState,
} from "@/lib/toolLifecycleState";
import { settingsApi } from "@/lib/api/settings";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("shared tool installation lifecycle", () => {
  it("publishes immediately across views, blocks re-entry and holds the lock through verification", async () => {
    const command = deferred();
    const verification = deferred();
    const view = renderHook(useToolLifecycleState);
    const secondView = renderHook(useToolLifecycleState);
    let task!: Promise<void>;
    act(() => {
      task = runToolLifecycleJob(
        ["claude"],
        "install",
        () => command.promise,
        () => verification.promise,
      );
    });
    expect(view.result.current.get("claude")).toBe("installing");
    expect(secondView.result.current.get("claude")).toBe("installing");
    const duplicate = vi.fn();
    await expect(
      runToolLifecycleJob(["claude"], "update", duplicate),
    ).rejects.toThrow("正在安装");
    expect(duplicate).not.toHaveBeenCalled();
    await act(async () => {
      command.resolve();
      await command.promise;
    });
    expect(view.result.current.get("claude")).toBe("verifying");
    await act(async () => {
      verification.resolve();
      await task;
    });
    expect(view.result.current.size).toBe(0);
    view.unmount();
    secondView.unmount();
  });

  it.each(["execute", "verify"])(
    "clears failed %s jobs and permits retry",
    async (stage) => {
      const fail = () => Promise.reject(new Error("failed"));
      await expect(
        runToolLifecycleJob(
          ["codex"],
          "install",
          stage === "execute" ? fail : async () => {},
          stage === "verify" ? fail : undefined,
        ),
      ).rejects.toThrow("failed");
      expect(isToolLifecycleBusy("codex")).toBe(false);
      await runToolLifecycleJob(["codex"], "install", async () => {});
      expect(isToolLifecycleBusy("codex")).toBe(false);
    },
  );

  it("does not report successful installation just because the command exits successfully", async () => {
    invoke.mockImplementation(async (command) =>
      command === "get_installed_tool_versions"
        ? [{ name: "claude", version: null, installed_but_broken: true }]
        : undefined,
    );
    await expect(
      settingsApi.runToolLifecycleAction(["claude"], "install"),
    ).rejects.toThrow("尚无法运行");
    expect(isToolLifecycleBusy("claude")).toBe(false);
    invoke.mockImplementation(async (command) =>
      command === "get_installed_tool_versions"
        ? [{ name: "claude", version: "1.0", installed_but_broken: false }]
        : undefined,
    );
    await expect(
      settingsApi.runToolLifecycleAction(["claude"], "install"),
    ).resolves.toBeUndefined();
  });

  it("rejects missing or partial version results instead of guessing success", async () => {
    invoke.mockImplementation(async (command) =>
      command === "get_installed_tool_versions"
        ? [{ name: "claude", version: "1.0" }]
        : undefined,
    );
    await expect(
      settingsApi.runToolLifecycleAction(["claude", "codex"], "install"),
    ).rejects.toThrow("尚无法运行");
    expect(isToolLifecycleBusy("claude")).toBe(false);
    expect(isToolLifecycleBusy("codex")).toBe(false);
  });
});
