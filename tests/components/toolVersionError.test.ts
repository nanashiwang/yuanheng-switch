import { describe, expect, it } from "vitest";
import { localizeToolVersionError } from "@/components/settings/toolVersionError";

describe("localizeToolVersionError", () => {
  it("hides the expected not-installed probe message", () => {
    expect(localizeToolVersionError("not installed or not executable")).toBe(
      null,
    );
    expect(
      localizeToolVersionError("[WSL:Ubuntu] not installed or not executable"),
    ).toBe(null);
  });

  it("keeps actionable tool diagnostics", () => {
    expect(localizeToolVersionError("Node.js 22+ is required")).toBe(
      "Node.js 22+ is required",
    );
  });
});
