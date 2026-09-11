import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsageCostSummary } from "@/components/usage/UsageCostSummary";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/query/usage", () => ({
  useUsageSummary: (...args: unknown[]) => query(...args),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, args?: { count?: number }) =>
      args?.count == null ? key : `${key}:${args.count}`,
    i18n: { language: "en", resolvedLanguage: "en" },
  }),
}));
vi.mock("@/components/usage/UsageDateRangePicker", () => ({
  UsageDateRangePicker: ({ onApply }: any) => (
    <button
      onClick={() =>
        onApply({ preset: "custom", customStartDate: 100, customEndDate: 200 })
      }
    >
      custom-date
    </button>
  ),
}));

describe("period credit summary", () => {
  beforeEach(() =>
    query.mockReturnValue({
      data: {
        totalCost: "12.34567",
        costSymbol: "⚡️",
        totalRequests: 10,
        pricedRequests: 8,
        unpricedRequests: 2,
        periodStart: 1789084800,
        periodEnd: 1789171200,
      },
      isLoading: false,
    }),
  );
  const props = () => ({
    range: { preset: "1d" as const },
    rangeLabel: "24 hours",
    filters: {
      appType: "codex",
      providerName: "OpenAI Official",
      model: "gpt-6-astra",
    },
    refreshIntervalMs: 0,
    onRangeChange: vi.fn(),
  });
  it("shows the scoped credit sum, priced coverage and backend period", () => {
    const p = props();
    render(<UsageCostSummary {...p} />);
    expect(screen.getByText("≈ ⚡️12.3457")).toBeInTheDocument();
    expect(
      screen.getByText(/usage.periodSummary.partial:2/),
    ).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(query).toHaveBeenCalledWith(p.range, p.filters, {
      refetchInterval: false,
    });
  });
  it("changes the shared range for presets and custom dates", () => {
    const p = props();
    render(<UsageCostSummary {...p} />);
    expect(
      screen.getByRole("button", { name: "usage.periodSummary.1d" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "usage.periodSummary.7d" }),
    );
    expect(p.onRangeChange).toHaveBeenCalledWith({ preset: "7d" });
    fireEvent.click(screen.getByText("custom-date"));
    expect(p.onRangeChange).toHaveBeenCalledWith({
      preset: "custom",
      customStartDate: 100,
      customEndDate: 200,
    });
  });
  it("does not turn unpriced or failed totals into a zero charge", () => {
    query.mockReturnValue({
      data: {
        totalCost: null,
        totalRequests: 3,
        pricedRequests: 0,
        unpricedRequests: 3,
      },
      isLoading: false,
    });
    const { rerender } = render(<UsageCostSummary {...props()} />);
    expect(screen.queryByText(/⚡️0/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/usage.periodSummary.partial:3/),
    ).toBeInTheDocument();
    query.mockReturnValue({
      data: undefined,
      error: new Error("offline"),
      isLoading: false,
    });
    rerender(<UsageCostSummary {...props()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "usage.periodSummary.loadFailed",
    );
    expect(screen.queryByText(/⚡️0/)).not.toBeInTheDocument();
  });
});
