import { useSyncExternalStore } from "react";

export type ToolLifecyclePhase = "installing" | "updating" | "verifying";
let snapshot: ReadonlyMap<string, ToolLifecyclePhase> = new Map();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => snapshot;
export const useToolLifecycleState = () =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
export const isToolLifecycleBusy = (tool: string) => snapshot.has(tool);

/** Shared by all entry points; the lock is synchronous, before the first await. */
export async function runToolLifecycleJob(
  tools: string[],
  action: "install" | "update",
  execute: () => Promise<void>,
  verify?: () => Promise<void>,
) {
  const targets = [...new Set(tools)];
  if (targets.some(isToolLifecycleBusy))
    throw new Error("该工具正在安装或更新，请等待当前任务完成");
  const publish = (phase?: ToolLifecyclePhase) => {
    const next = new Map(snapshot);
    for (const tool of targets) {
      if (phase) next.set(tool, phase);
      else next.delete(tool);
    }
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  publish(action === "install" ? "installing" : "updating");
  try {
    await execute();
    if (verify) {
      publish("verifying");
      await verify();
    }
  } finally {
    publish();
  }
}
