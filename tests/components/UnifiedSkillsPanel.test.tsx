import { createRef } from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import UnifiedSkillsPanel, {
  type UnifiedSkillsPanelHandle,
} from "@/components/skills/UnifiedSkillsPanel";

const scanUnmanagedMock = vi.fn();
const toggleSkillAppMock = vi.fn();
const uninstallSkillMock = vi.fn();
const importSkillsMock = vi.fn();
const installFromZipMock = vi.fn();
const deleteSkillBackupMock = vi.fn();
const restoreSkillBackupMock = vi.fn();
const reorderSkillsMock = vi.fn();
const toastErrorMock = vi.fn();
const dndState = vi.hoisted(() => ({
  onDragEnd: undefined as undefined | ((event: unknown) => Promise<void>),
}));
let installedSkillsData: any[] = [];

vi.mock("@dnd-kit/core", async () => {
  const React = await import("react");
  return {
    DndContext: ({ children, onDragEnd }: any) => {
      dndState.onDragEnd = onDragEnd;
      return React.createElement(React.Fragment, null, children);
    },
    KeyboardSensor: class {},
    PointerSensor: class {},
    closestCenter: vi.fn(),
    useSensor: vi.fn(() => ({})),
    useSensors: vi.fn((...sensors) => sensors),
  };
});

vi.mock("@dnd-kit/sortable", async () => {
  const React = await import("react");
  const actual = await vi.importActual<any>("@dnd-kit/sortable");
  return {
    ...actual,
    SortableContext: ({ children }: any) =>
      React.createElement(React.Fragment, null, children),
    useSortable: ({ id, disabled }: any) => ({
      setNodeRef: vi.fn(),
      attributes: { "data-sortable-id": id },
      listeners: { onPointerDown: vi.fn() },
      transform: null,
      transition: null,
      isDragging: false,
      disabled,
    }),
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: (...args: unknown[]) => toastErrorMock(...args),
    info: vi.fn(),
  },
}));

vi.mock("@/hooks/useSkills", () => ({
  useInstalledSkills: () => ({
    data: installedSkillsData,
    isLoading: false,
  }),
  useReorderInstalledSkills: () => ({
    mutateAsync: reorderSkillsMock,
    isPending: false,
  }),
  useSkillBackups: () => ({
    data: [],
    refetch: vi.fn(),
    isFetching: false,
  }),
  useDeleteSkillBackup: () => ({
    mutateAsync: deleteSkillBackupMock,
    isPending: false,
  }),
  useToggleSkillApp: () => ({
    mutateAsync: toggleSkillAppMock,
  }),
  useRestoreSkillBackup: () => ({
    mutateAsync: restoreSkillBackupMock,
    isPending: false,
  }),
  useUninstallSkill: () => ({
    mutateAsync: uninstallSkillMock,
  }),
  useScanUnmanagedSkills: () => ({
    data: [
      {
        directory: "shared-skill",
        name: "Shared Skill",
        description: "Imported from Grok Build",
        foundIn: ["grokbuild"],
        path: "/tmp/shared-skill",
      },
    ],
    refetch: scanUnmanagedMock,
  }),
  useImportSkillsFromApps: () => ({
    mutateAsync: importSkillsMock,
  }),
  useInstallSkillsFromZip: () => ({
    mutateAsync: installFromZipMock,
  }),
  useCheckSkillUpdates: () => ({
    data: [],
    refetch: vi.fn(),
    isFetching: false,
  }),
  useUpdateSkill: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

describe("UnifiedSkillsPanel", () => {
  beforeEach(() => {
    scanUnmanagedMock.mockResolvedValue({
      data: [
        {
          directory: "shared-skill",
          name: "Shared Skill",
          description: "Imported from Grok Build",
          foundIn: ["grokbuild"],
          path: "/tmp/shared-skill",
        },
      ],
    });
    toggleSkillAppMock.mockReset();
    uninstallSkillMock.mockReset();
    importSkillsMock.mockReset();
    installFromZipMock.mockReset();
    deleteSkillBackupMock.mockReset();
    restoreSkillBackupMock.mockReset();
    reorderSkillsMock.mockReset();
    toastErrorMock.mockReset();
    installedSkillsData = [];
    dndState.onDragEnd = undefined;
  });

  it("provides a bounded native mouse-wheel scroll area", () => {
    render(
      <UnifiedSkillsPanel onOpenDiscovery={() => {}} currentApp="claude" />,
    );

    expect(screen.getByTestId("installed-skills-scroll-area")).toHaveClass(
      "min-h-0",
      "overflow-y-auto",
      "skills-scroll-area",
    );
  });

  it("reorders installed skills using the drag handle", async () => {
    installedSkillsData = [
      {
        id: "a",
        name: "Skill A",
        directory: "a",
        apps: {},
        installedAt: 0,
        updatedAt: 0,
      },
      {
        id: "b",
        name: "Skill B",
        directory: "b",
        apps: {},
        installedAt: 0,
        updatedAt: 0,
      },
    ];
    reorderSkillsMock.mockResolvedValue(["b", "a"]);

    render(
      <UnifiedSkillsPanel onOpenDiscovery={() => {}} currentApp="claude" />,
    );

    expect(
      screen.getAllByRole("button", { name: "skills.dragHandle" })[0],
    ).toHaveAttribute("data-sortable-id", "a");

    await act(async () => {
      await dndState.onDragEnd?.({ active: { id: "a" }, over: { id: "b" } });
    });

    expect(reorderSkillsMock).toHaveBeenCalledWith([
      expect.objectContaining({ id: "b" }),
      expect.objectContaining({ id: "a" }),
    ]);
  });

  it("reports a save failure without swallowing it", async () => {
    installedSkillsData = [
      {
        id: "a",
        name: "Skill A",
        directory: "a",
        apps: {},
        installedAt: 0,
        updatedAt: 0,
      },
      {
        id: "b",
        name: "Skill B",
        directory: "b",
        apps: {},
        installedAt: 0,
        updatedAt: 0,
      },
    ];
    reorderSkillsMock.mockRejectedValue(new Error("disk full"));

    render(
      <UnifiedSkillsPanel onOpenDiscovery={() => {}} currentApp="claude" />,
    );

    await act(async () => {
      await dndState.onDragEnd?.({ active: { id: "a" }, over: { id: "b" } });
    });

    expect(toastErrorMock).toHaveBeenCalledWith(
      "skills.sortUpdateFailed",
      expect.objectContaining({ description: "Error: disk full" }),
    );
  });

  it("opens the import dialog without crashing when app toggles render", async () => {
    const ref = createRef<UnifiedSkillsPanelHandle>();

    render(
      <UnifiedSkillsPanel
        ref={ref}
        onOpenDiscovery={() => {}}
        currentApp="claude"
      />,
    );

    await act(async () => {
      await ref.current?.openImport();
    });

    await waitFor(() => {
      expect(screen.getByText("skills.import")).toBeInTheDocument();
      expect(screen.getByText("Shared Skill")).toBeInTheDocument();
      expect(screen.getByText("/tmp/shared-skill")).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByText("skills.importSelected").click();
    });

    await waitFor(() => {
      expect(importSkillsMock).toHaveBeenCalledWith([
        {
          directory: "shared-skill",
          apps: expect.objectContaining({ grokbuild: true }),
        },
      ]);
    });
  });
});
