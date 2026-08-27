import {
  normalizeCodexHistoryMigrationTask,
  type CodexHistoryMigrationTask,
} from "@/lib/api/settings";

const baseTask = {
  migrationId: "migration-1",
  sourceProviderIds: [],
  targetNamespace: "custom",
  totalCount: 0,
  successCount: 0,
  failedCount: 0,
  skippedCount: 0,
  status: "preview",
  preview: {
    ordinarySessions: 0,
    archivedSessions: 0,
    activeSessions: 0,
    databaseRows: 0,
    physicalFiles: 0,
    totalCount: 0,
    providerCounts: {},
  },
  pendingFiles: [],
  rollbackRequested: false,
} satisfies CodexHistoryMigrationTask;

describe("normalizeCodexHistoryMigrationTask", () => {
  it("restores omitted empty arrays from Rust payloads", () => {
    const task = normalizeCodexHistoryMigrationTask({
      ...baseTask,
      sourceProviderIds: undefined,
      pendingFiles: undefined,
    });

    expect(task?.sourceProviderIds).toEqual([]);
    expect(task?.pendingFiles).toEqual([]);
  });

  it("fills a missing preview without throwing during render", () => {
    const task = normalizeCodexHistoryMigrationTask({
      ...baseTask,
      preview: undefined,
    });

    expect(task?.preview).toEqual({
      ordinarySessions: 0,
      archivedSessions: 0,
      activeSessions: 0,
      databaseRows: 0,
      physicalFiles: 0,
      totalCount: 0,
      providerCounts: {},
    });
  });

  it("keeps populated migration fields unchanged", () => {
    const task = normalizeCodexHistoryMigrationTask({
      ...baseTask,
      sourceProviderIds: ["openai"],
      pendingFiles: ["session.jsonl"],
      preview: {
        ...baseTask.preview,
        activeSessions: 1,
        providerCounts: { openai: 1 },
      },
    });

    expect(task?.sourceProviderIds).toEqual(["openai"]);
    expect(task?.pendingFiles).toEqual(["session.jsonl"]);
    expect(task?.preview.activeSessions).toBe(1);
    expect(task?.preview.providerCounts).toEqual({ openai: 1 });
  });
});
