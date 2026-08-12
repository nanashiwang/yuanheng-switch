import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { useReorderInstalledSkills } from "@/hooks/useSkills";
import type { InstalledSkill } from "@/lib/api/skills";
import { server } from "../msw/server";

const TAURI_ENDPOINT = "http://tauri.local";

function skill(id: string): InstalledSkill {
  return {
    id,
    name: id.toUpperCase(),
    directory: id,
    apps: {
      claude: false,
      codex: false,
      gemini: false,
      opencode: false,
      openclaw: false,
      hermes: false,
    },
    installedAt: 0,
    updatedAt: 0,
  };
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("useReorderInstalledSkills", () => {
  it("submits only skill ids in the requested order", async () => {
    let submitted: string[] = [];
    server.use(
      http.post(
        `${TAURI_ENDPOINT}/set_installed_skill_order`,
        async ({ request }) => {
          submitted = ((await request.json()) as { ids: string[] }).ids;
          return HttpResponse.json(submitted);
        },
      ),
    );
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(["skills", "installed"], [skill("a"), skill("b")]);
    const { result } = renderHook(() => useReorderInstalledSkills(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync([skill("b"), skill("a")]);
    });

    expect(submitted).toEqual(["b", "a"]);
  });

  it("restores the previous cached order when persistence fails", async () => {
    server.use(
      http.post(`${TAURI_ENDPOINT}/set_installed_skill_order`, () =>
        HttpResponse.text("store unavailable", { status: 500 }),
      ),
    );
    const { queryClient, wrapper } = setup();
    const previous = [skill("a"), skill("b")];
    queryClient.setQueryData(["skills", "installed"], previous);
    const { result } = renderHook(() => useReorderInstalledSkills(), {
      wrapper,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync([skill("b"), skill("a")]),
      ).rejects.toThrow();
    });

    expect(
      queryClient
        .getQueryData<InstalledSkill[]>(["skills", "installed"])
        ?.map((item) => item.id),
    ).toEqual(["a", "b"]);
  });
});
