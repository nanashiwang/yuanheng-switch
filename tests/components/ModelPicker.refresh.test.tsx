import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { ModelPicker } from "@/components/desktop/ModelPicker";
import { useYuanhengToolStatuses, yuanhengKeys } from "@/lib/query/yuanheng";
import { createTestQueryClient } from "../utils/testQueryClient";

const probe = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock("@/lib/api", async (original) => {
  const actual = await original<typeof import("@/lib/api")>();
  return {
    ...actual,
    yuanhengApi: {
      ...actual.yuanhengApi,
      getConnection: () => new Promise(() => {}),
      getToolStatuses: () => probe.run(),
    },
  };
});
Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

it.each(["success", "failure"])(
  "keeps the scrolling list mounted through refresh %s",
  async (outcome) => {
    let settle!: () => void;
    probe.run.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          settle = () =>
            outcome === "success"
              ? resolve([{ app: "claude", supported: true }])
              : reject(new Error("offline"));
        }),
    );
    const client = createTestQueryClient();
    const connection = {
      baseUrl: "https://example.test",
      userId: "one",
      connected: true,
      lastSyncedAt: 1,
    };
    client.setQueryData(yuanhengKeys.connection, connection);
    // Preload the currently shipped key, as well as the account-identity key.
    const rows = [{ app: "claude", supported: true }];
    client.setQueryData([...yuanhengKeys.tools, "one", 1], rows);
    client.setQueryData(
      [...yuanhengKeys.tools, connection.baseUrl, "one", true],
      rows,
    );
    const change = vi.fn();
    function Harness() {
      const tools = useYuanhengToolStatuses();
      return tools.data?.[0]?.supported ? (
        <ModelPicker
          label="model"
          models={Array.from({ length: 80 }, (_, i) => `model-${i}`)}
          onChange={change}
          onRefresh={() => {
            client.setQueryData(yuanhengKeys.connection, {
              ...connection,
              lastSyncedAt: 2,
            });
            void client.invalidateQueries({ queryKey: yuanhengKeys.tools });
          }}
        />
      ) : (
        <p>loading tools</p>
      );
    }
    const ui = render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("combobox"));
    await act(async () => {});
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    const dialog = screen.getByRole("dialog");
    const list = screen.getByRole("listbox");
    for (let i = 0; i < 10; i++) {
      fireEvent.wheel(list, { deltaY: 100 });
      fireEvent.scroll(list, { target: { scrollTop: 100 * i } });
    }
    await act(async () => {
      settle();
    });
    expect(screen.getByRole("dialog")).toBe(dialog);
    fireEvent.click(screen.getByText("model-79"));
    expect(change).toHaveBeenCalledWith("model-79");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    ui.unmount();
    client.clear();
  },
);
