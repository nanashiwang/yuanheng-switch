import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GroupPicker,
  GROUP_FAVORITES_KEY,
} from "@/components/desktop/GroupPicker";
vi.mock("@/components/desktop/desktopI18n", () => ({
  dt: (s: string, vars: Record<string, unknown> = {}) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? "")),
}));
Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});
const options = [
  { value: "standard", label: "standard · 1x" },
  { value: "premium", label: "premium · 2x" },
  { value: "special", label: "special · 3x" },
];
const open = (name = "分组") => {
  fireEvent.click(screen.getByRole("combobox", { name }));
  return screen.getByRole("dialog");
};
const order = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole("option")
    .map((item) => item.getAttribute("data-value"));
describe("group favorites", () => {
  beforeEach(() => localStorage.clear());
  it("pins exact groups, retains current selection and labels, persists and cancels favorites", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    const props = {
      label: "分组",
      value: "standard",
      options,
      onChange: change,
    };
    const view = render(<GroupPicker {...props} />);
    let dialog = open();
    within(dialog).getByRole("button", { name: "收藏分组 premium" }).focus();
    await user.keyboard("{Enter}");
    expect(order(dialog)).toEqual([
      "group:premium",
      "group:standard",
      "group:special",
    ]);
    expect(
      within(dialog).getByRole("button", { name: "取消收藏分组 premium" }),
    ).toHaveFocus();
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByLabelText("分组")).toHaveTextContent("standard · 1x");
    view.unmount();
    render(<GroupPicker {...props} />);
    dialog = open();
    expect(order(dialog)[0]).toBe("group:premium");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "取消收藏分组 premium" }),
    );
    expect(order(dialog)[0]).toBe("group:standard");
    fireEvent.change(within(dialog).getByRole("combobox"), {
      target: { value: " PREMIUM " },
    });
    expect(order(dialog)).toEqual(["group:premium"]);
    await user.click(within(dialog).getByRole("combobox"));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(change).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledWith("premium");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("never expands options, switches automatically or hides a saved out-of-catalog group", () => {
    localStorage.setItem(
      GROUP_FAVORITES_KEY,
      JSON.stringify({ groups: ["premium", "not-authorized"] }),
    );
    const change = vi.fn();
    const props = {
      label: "分组",
      value: "old-group",
      options,
      onChange: change,
    };
    const view = render(<GroupPicker {...props} />);
    const dialog = open();
    expect(screen.getByLabelText("分组")).toHaveTextContent("old-group");
    expect(order(dialog)).toHaveLength(3);
    expect(
      within(dialog).queryByText("not-authorized"),
    ).not.toBeInTheDocument();
    view.rerender(<GroupPicker {...props} options={[options[0]]} />);
    expect(order(dialog)).toEqual(["group:standard"]);
    expect(change).not.toHaveBeenCalled();
    view.rerender(<GroupPicker {...props} disabled />);
    expect(
      within(dialog).getByRole("button", { name: "取消收藏分组 premium" }),
    ).toBeDisabled();
    fireEvent.click(within(dialog).getByText("premium · 2x"));
    expect(change).not.toHaveBeenCalled();
  });
  it("shares local preferences, tolerates corruption and storage events, resets search on reopening", () => {
    localStorage.setItem(GROUP_FAVORITES_KEY, "broken");
    render(
      <>
        <GroupPicker
          label="一"
          value="standard"
          options={options}
          onChange={vi.fn()}
        />
        <GroupPicker
          label="二"
          value="standard"
          options={options}
          onChange={vi.fn()}
        />
      </>,
    );
    let dialog = open("一");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "收藏分组 special" }),
    );
    fireEvent.keyDown(dialog, { key: "Escape" });
    dialog = open("二");
    expect(order(dialog)[0]).toBe("group:special");
    fireEvent.change(within(dialog).getByRole("combobox"), {
      target: { value: "no-match" },
    });
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "没有找到匹配的分组",
    );
    fireEvent.keyDown(dialog, { key: "Escape" });
    dialog = open("二");
    expect(order(dialog)).toHaveLength(3);
    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(order(dialog)[0]).toBe("group:standard");
  });
  it("cannot favorite the empty placeholder and does not crash on denied storage", () => {
    const change = vi.fn();
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    try {
      render(
        <GroupPicker
          label="分组"
          value=""
          options={[{ value: "", label: "选择令牌分组" }, ...options]}
          onChange={change}
        />,
      );
      const dialog = open();
      expect(within(dialog).getAllByRole("button")).toHaveLength(3);
      fireEvent.click(
        within(dialog).getByRole("button", { name: "收藏分组 premium" }),
      );
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "无法保存收藏",
      );
      expect(change).not.toHaveBeenCalled();
      expect(order(dialog)[0]).toBe("group:");
    } finally {
      write.mockRestore();
    }
  });
});
