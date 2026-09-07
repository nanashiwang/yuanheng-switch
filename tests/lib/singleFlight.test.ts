import { describe, expect, it, vi } from "vitest";
import { createSingleFlight } from "@/lib/singleFlight";

describe("single-flight detection", () => {
  it("shares pending calls but never caches a settled result", async () => {
    const run = createSingleFlight();
    const load = vi.fn().mockResolvedValue(1);
    const [a, b] = await Promise.all([
      run("local:codex", load),
      run("local:codex", load),
    ]);
    expect([a, b]).toEqual([1, 1]);
    expect(load).toHaveBeenCalledTimes(1);
    await run("local:codex", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("different modes/preferences are isolated and failures can retry", async () => {
    const run = createSingleFlight();
    const load = vi.fn().mockRejectedValue(new Error("failed"));
    await expect(run("local", load)).rejects.toThrow("failed");
    load.mockResolvedValue(2);
    expect(await run("local", load)).toBe(2);
    await Promise.all([
      run("local:a", load),
      run("local:b", load),
      run("remote:a", load),
    ]);
    expect(load).toHaveBeenCalledTimes(5);
  });
});
