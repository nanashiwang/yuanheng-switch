import { describe, expect, it } from "vitest";
import type { Provider } from "@/types";
import { isYuanhengProvider } from "@/components/YuanhengProjectBanner";

const provider = (settingsConfig: Record<string, unknown>): Provider => ({
  id: "test",
  name: "Test",
  settingsConfig,
});

describe("isYuanhengProvider", () => {
  it("recognizes YuanHeng API URLs in provider configuration", () => {
    expect(
      isYuanhengProvider(
        provider({ env: { ANTHROPIC_BASE_URL: "https://cn.meta-api.vip" } }),
      ),
    ).toBe(true);
  });

  it("does not mark local or missing providers as connected", () => {
    expect(
      isYuanhengProvider(provider({ baseUrl: "https://api.example.com/v1" })),
    ).toBe(false);
    expect(isYuanhengProvider()).toBe(false);
  });
});
