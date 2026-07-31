import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useUiDensity } from "@/hooks/useUiDensity";

describe("useUiDensity", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.uiDensity;
  });

  it("defaults to comfortable density", () => {
    const { result } = renderHook(() => useUiDensity());

    expect(result.current.density).toBe("comfortable");
    expect(document.documentElement.dataset.uiDensity).toBe("comfortable");
  });

  it("persists and applies compact density", () => {
    const { result } = renderHook(() => useUiDensity());

    act(() => result.current.setDensity("compact"));

    expect(result.current.density).toBe("compact");
    expect(localStorage.getItem("yuanheng-ui-density")).toBe("compact");
    expect(document.documentElement.dataset.uiDensity).toBe("compact");
  });
});
