import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, getVersionMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  getVersionMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: getVersionMock }));

import { checkForUpdate, getCurrentVersion } from "@/lib/updater";

describe("desktop updater API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks updates through the proxy-aware backend command", async () => {
    invokeMock.mockResolvedValue({
      currentVersion: "0.1.19",
      availableVersion: "0.1.20",
      notes: "fix updater",
      pubDate: "2026-08-01T18:00:00Z",
    });

    await expect(checkForUpdate({ timeout: 12_000 })).resolves.toEqual({
      status: "available",
      info: {
        currentVersion: "0.1.19",
        availableVersion: "0.1.20",
        notes: "fix updater",
        pubDate: "2026-08-01T18:00:00Z",
      },
    });
    expect(invokeMock).toHaveBeenCalledWith("check_desktop_update", {
      timeoutMs: 12_000,
    });
  });

  it("returns up-to-date when the backend finds no newer release", async () => {
    invokeMock.mockResolvedValue(null);

    await expect(checkForUpdate()).resolves.toEqual({ status: "up-to-date" });
  });

  it("keeps the current version helper resilient", async () => {
    getVersionMock.mockRejectedValue(new Error("not in Tauri"));
    await expect(getCurrentVersion()).resolves.toBe("");
  });
});
