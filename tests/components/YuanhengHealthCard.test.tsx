import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { YuanhengHealthCard } from "@/components/desktop/YuanhengHealthCard";
const { diagnostics, api, clipboard, toast, account } = vi.hoisted(() => ({
  diagnostics: {
    data: undefined as any,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  api: {
    getDiagnosticSnapshot: vi.fn(),
    exportDiagnostics: vi.fn(),
    saveFileDialog: vi.fn(),
  },
  clipboard: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  account: { userId: "user-one", lastSyncedAt: 1, connected: true },
}));
vi.mock("@/lib/query/yuanheng", () => ({
  useYuanhengConnection: () => ({ data: account }),
  useYuanhengDiagnostics: () => diagnostics,
  useRepairYuanheng: () => ({ isPending: false }),
  useRollbackYuanhengTools: () => ({ isPending: false }),
  useRotateYuanhengCredential: () => ({ isPending: false }),
}));
vi.mock("@/lib/api", () => ({ yuanhengApi: api, settingsApi: api }));
vi.mock("@/lib/clipboard", () => ({ copyText: clipboard }));
vi.mock("sonner", () => ({ toast }));
const safe = JSON.stringify({
  schemaVersion: 2,
  snapshotId: "one",
  proxy: { running: true, port: 15721 },
  recentRequests: [{ status: 401, latencyMs: 99 }],
});
describe("diagnostic snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    account.userId = "user-one";
    diagnostics.data = {
      status: "ok",
      readyTools: 1,
      checkedAt: 10,
      checks: [],
      snapshotId: "one",
      supportJson: safe,
    };
    diagnostics.refetch.mockResolvedValue({
      isError: false,
      data: { status: "warning" },
    });
    api.getDiagnosticSnapshot.mockResolvedValue(safe);
    api.exportDiagnostics.mockResolvedValue("/tmp/report.json");
    api.saveFileDialog.mockResolvedValue("/tmp/report.json");
  });
  it("preview, copy and export refer to the identical snapshot, without another health check", async () => {
    render(<YuanhengHealthCard />);
    fireEvent.click(screen.getByRole("button", { name: "检查详情" }));
    fireEvent.click(screen.getByRole("button", { name: "预览脱敏报告" }));
    expect(screen.getByText(safe)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^关闭$/ }));
    fireEvent.click(screen.getByRole("button", { name: "复制脱敏诊断" }));
    await waitFor(() => expect(clipboard).toHaveBeenCalledWith(safe));
    fireEvent.click(screen.getByRole("button", { name: "导出脱敏诊断" }));
    await waitFor(() =>
      expect(api.exportDiagnostics).toHaveBeenCalledWith(
        "/tmp/report.json",
        "one",
      ),
    );
    expect(diagnostics.refetch).not.toHaveBeenCalled();
  });
  it("expired or account-changed snapshots are not copied", async () => {
    api.getDiagnosticSnapshot.mockRejectedValue(new Error("诊断快照已过期"));
    render(<YuanhengHealthCard />);
    fireEvent.click(screen.getByRole("button", { name: "检查详情" }));
    fireEvent.click(screen.getByRole("button", { name: "复制脱敏诊断" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(clipboard).not.toHaveBeenCalled();
  });
  it("a prior healthy report cannot produce a success toast after a failing check", async () => {
    render(<YuanhengHealthCard />);
    fireEvent.click(screen.getByRole("button", { name: "重新检查" }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });
});
