import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolInstallCancel } from "@/components/desktop/ToolInstallCancel";
import {
  canCancelToolInstall,
  cancelToolInstall,
  runToolLifecycleJob,
  useToolLifecycleState,
} from "@/lib/toolLifecycleState";
import { renderHook } from "@testing-library/react";
const later = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("real installation cancellation state", () => {
  it("shares cancellation across two views and only unlocks after execution settles", async () => {
    const execution = later();
    const cancel = vi.fn(async () => true);
    let job!: Promise<void>;
    render(
      <>
        <ToolInstallCancel tool="claude" />
        <ToolInstallCancel tool="claude" />
      </>,
    );
    act(() => {
      job = runToolLifecycleJob(["claude"], "install", async (setCancel) => {
        setCancel(cancel);
        await execution.promise;
      });
    });
    expect(screen.getAllByRole("button", { name: "取消安装" })).toHaveLength(2);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "取消安装" })[0]);
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    for (const button of screen.getAllByRole("button", {
      name: "正在停止安装…",
    }))
      expect(button).toBeDisabled();
    expect(canCancelToolInstall("claude")).toBe(false);
    await expect(
      runToolLifecycleJob(["claude"], "install", async () => {}),
    ).rejects.toThrow("正在安装");
    await act(async () => {
      execution.resolve();
      await job;
    });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("restores cancel affordance when the backend rejects and ignores late acknowledgements", async () => {
    const execution = later();
    let acknowledge!: (accepted: boolean) => void;
    const cancel = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const view = renderHook(useToolLifecycleState);
    let job!: Promise<void>;
    act(() => {
      job = runToolLifecycleJob(["codex"], "install", async (setCancel) => {
        setCancel(cancel);
        await execution.promise;
      });
    });
    let cancellation!: Promise<boolean>;
    act(() => {
      cancellation = cancelToolInstall("codex");
    });
    await act(async () => {
      acknowledge(false);
      await cancellation;
    });
    expect(canCancelToolInstall("codex")).toBe(true);
    act(() => {
      cancellation = cancelToolInstall("codex");
    });
    await act(async () => {
      execution.resolve();
      await job;
    });
    const next = later();
    act(() => {
      job = runToolLifecycleJob(["codex"], "update", async () => next.promise);
    });
    await act(async () => {
      acknowledge(false);
      await cancellation;
    });
    expect(view.result.current.get("codex")).toBe("updating");
    await act(async () => {
      next.resolve();
      await job;
    });
    view.unmount();
  });

  it("does not promise cancellation for WSL, updates or post-install verification", async () => {
    render(<ToolInstallCancel tool="gemini" />);
    const external = later();
    let job!: Promise<void>;
    act(() => {
      job = runToolLifecycleJob(["gemini"], "install", async (setCancel) => {
        setCancel();
        await external.promise;
      });
    });
    expect(screen.getByRole("status")).toHaveTextContent("WSL");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await act(async () => {
      external.resolve();
      await job;
    });
    const verify = later();
    await act(async () => {
      job = runToolLifecycleJob(
        ["gemini"],
        "install",
        async (setCancel) => {
          setCancel(async () => true);
        },
        () => verify.promise,
      );
    });
    expect(canCancelToolInstall("gemini")).toBe(false);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await act(async () => {
      verify.resolve();
      await job;
    });
  });
});
