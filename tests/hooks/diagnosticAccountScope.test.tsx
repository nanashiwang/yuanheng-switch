import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  useYuanhengDiagnostics,
  useYuanhengToolStatuses,
  yuanhengKeys,
} from "@/lib/query/yuanheng";
import { createTestQueryClient } from "../utils/testQueryClient";

describe("account-scoped diagnostic and tool cache", () => {
  it("changing account does not display the previous account's report or tool models", async () => {
    const client = createTestQueryClient();
    const connection = { userId: "one", connected: true, lastSyncedAt: 1 };
    client.setQueryData(yuanhengKeys.connection, connection);
    client.setQueryData([...yuanhengKeys.diagnostics, "one", true, 1], {
      status: "ok",
      snapshotId: "private-one",
    });
    client.setQueryData(
      [...yuanhengKeys.tools, "one", 1],
      [{ app: "codex", model: "old-account-model" }],
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const view = renderHook(
      () => ({
        report: useYuanhengDiagnostics(false),
        tools: useYuanhengToolStatuses(),
      }),
      { wrapper },
    );
    expect(view.result.current.report.data?.snapshotId).toBe("private-one");
    await act(async () => {
      client.setQueryData(yuanhengKeys.connection, {
        ...connection,
        userId: "two",
        lastSyncedAt: 2,
      });
    });
    await waitFor(() =>
      expect(view.result.current.report.data).toBeUndefined(),
    );
    await waitFor(() =>
      expect(
        view.result.current.tools.data?.some(
          (row) => row.model === "old-account-model",
        ) ?? false,
      ).toBe(false),
    );
    view.unmount();
    client.clear();
  });
});
