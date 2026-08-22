import { createRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  SkillsPage,
  getSkillsPageHeaderActions,
  inferSkillMarketCategory,
  type SkillsPageHandle,
} from "@/components/skills/SkillsPage";
import type {
  DiscoverableSkill,
  SkillRepo,
  SkillsShDiscoverableSkill,
  SkillsShSearchResult,
} from "@/lib/api/skills";

const installMutateAsyncMock = vi.fn();
let discoverableSkillsMock: DiscoverableSkill[] = [];
let skillReposMock: SkillRepo[] = [];
const refetchDiscoverableMock = vi.fn();
const refetchSkillsShMock = vi.fn();

// Stable cache so repeated renders see referentially-equal data.
// SkillsPage has `useEffect([skillsShResult, ...])` that calls setState — a
// fresh object every render would loop forever.
const searchCache = new Map<
  string,
  {
    data: SkillsShSearchResult | undefined;
    isLoading: boolean;
    isFetching: boolean;
    isPlaceholderData?: boolean;
    isError?: boolean;
  }
>();

const setSearchResult = (
  query: string,
  offset: number,
  result: SkillsShSearchResult | undefined,
  state: Partial<{
    isLoading: boolean;
    isFetching: boolean;
    isPlaceholderData: boolean;
    isError: boolean;
  }> = {},
) => {
  searchCache.set(`${query}:${offset}`, {
    data: result,
    isLoading: false,
    isFetching: false,
    ...state,
  });
};

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/hooks/useSkills", () => ({
  useDiscoverableSkills: () => ({
    data: discoverableSkillsMock,
    isLoading: false,
    isFetching: false,
    refetch: refetchDiscoverableMock,
  }),
  useInstalledSkills: () => ({
    data: [],
    isLoading: false,
  }),
  useInstallSkill: () => ({
    mutateAsync: installMutateAsyncMock,
  }),
  useSkillRepos: () => ({
    data: skillReposMock,
    refetch: vi.fn(),
  }),
  useAddSkillRepo: () => ({
    mutateAsync: vi.fn(),
  }),
  useRemoveSkillRepo: () => ({
    mutateAsync: vi.fn(),
  }),
  useSearchSkillsSh: (query: string, _limit: number, offset: number) => {
    const cached = searchCache.get(`${query}:${offset}`);
    if (cached) return { ...cached, refetch: refetchSkillsShMock };
    return {
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: refetchSkillsShMock,
    };
  },
}));

const makeSkillsShSkill = (
  overrides: Partial<SkillsShDiscoverableSkill> = {},
): SkillsShDiscoverableSkill => ({
  key: "agent-browser:owner-a:repo-a",
  name: "Agent Browser",
  directory: "agent-browser",
  repoOwner: "owner-a",
  repoName: "repo-a",
  repoBranch: "main",
  installs: 100,
  readmeUrl: "https://example.com/a",
  ...overrides,
});

const makeDiscoverableSkill = (
  overrides: Partial<DiscoverableSkill> = {},
): DiscoverableSkill => ({
  key: "repo-skill:owner-a:repo-a",
  name: "Repo Skill",
  description: "Skill from a configured repository",
  directory: "repo-skill",
  readmeUrl: "https://example.com/repo-skill",
  repoOwner: "owner-a",
  repoName: "repo-a",
  repoBranch: "main",
  ...overrides,
});

const makeSkillRepo = (overrides: Partial<SkillRepo> = {}): SkillRepo => ({
  owner: "owner-a",
  name: "repo-a",
  branch: "main",
  enabled: true,
  ...overrides,
});

describe("SkillsPage - skills.sh install (regression)", () => {
  beforeEach(() => {
    installMutateAsyncMock.mockReset();
    installMutateAsyncMock.mockResolvedValue({});
    discoverableSkillsMock = [];
    skillReposMock = [];
    refetchDiscoverableMock.mockReset();
    refetchSkillsShMock.mockReset();
    searchCache.clear();
  });

  it("classifies common marketplace skills without trusting source metadata", () => {
    expect(
      inferSkillMarketCategory(
        makeDiscoverableSkill({
          name: "Browser Automation",
          description: "Automate browser workflows",
        }),
      ),
    ).toBe("automation");
    expect(
      inferSkillMarketCategory(
        makeDiscoverableSkill({
          name: "Unknown Utility",
          description: "A focused helper",
          directory: "unknown-utility",
          repoName: "misc-tools",
        }),
      ),
    ).toBe("other");
    expect(
      inferSkillMarketCategory(
        makeDiscoverableSkill({
          name: "Rapid Notes",
          description: "Capture thoughts quickly",
          directory: "rapid-notes",
          repoName: "rapid-notes",
        }),
      ),
    ).toBe("other");
  });

  it("provides a bounded native mouse-wheel scroll area", () => {
    render(<SkillsPage initialApp="claude" />);

    expect(screen.getByTestId("skills-discovery-scroll-area")).toHaveClass(
      "min-h-0",
      "overflow-y-auto",
      "skills-scroll-area",
    );
  });

  it("falls back to a supported install target for unsupported active apps", () => {
    render(<SkillsPage initialApp="openclaw" initialSource="skillssh" />);

    expect(
      screen.getByLabelText("skills.market.installTarget"),
    ).toHaveTextContent("Claude");
  });

  it("installs the second skill when two results share the same directory", async () => {
    const first = makeSkillsShSkill({
      key: "agent-browser:owner-a:repo-a",
      name: "Agent Browser A",
      repoOwner: "owner-a",
      repoName: "repo-a",
    });
    const second = makeSkillsShSkill({
      key: "agent-browser:owner-b:repo-b",
      name: "Agent Browser B",
      repoOwner: "owner-b",
      repoName: "repo-b",
    });

    setSearchResult("agent", 0, {
      skills: [first, second],
      totalCount: 2,
      query: "agent",
    });

    const ref = createRef<SkillsPageHandle>();
    render(<SkillsPage ref={ref} initialApp="claude" />);

    const user = userEvent.setup();

    // Switch to skills.sh source
    await user.click(screen.getByRole("button", { name: /skills\.sh/i }));

    // Type a query and submit
    const input = screen.getByPlaceholderText(
      "skills.skillssh.searchPlaceholder",
    );
    await user.type(input, "agent");
    await user.click(screen.getByRole("button", { name: "skills.search" }));

    // Wait for both cards to render
    await waitFor(() => {
      expect(screen.getByText("Agent Browser A")).toBeInTheDocument();
      expect(screen.getByText("Agent Browser B")).toBeInTheDocument();
    });

    // Click install on the SECOND card (Agent Browser B)
    const secondCard = screen
      .getByText("Agent Browser B")
      .closest("div.glass-card");
    expect(secondCard).not.toBeNull();
    const installButton = secondCard!.querySelector(
      "button:last-of-type",
    ) as HTMLButtonElement;
    expect(installButton).not.toBeNull();
    await user.click(installButton);

    // Verify the SECOND skill was passed to the install mutation, not the first
    await waitFor(() => {
      expect(installMutateAsyncMock).toHaveBeenCalledTimes(1);
    });
    const callArgs = installMutateAsyncMock.mock.calls[0][0];
    expect(callArgs.skill.repoOwner).toBe("owner-b");
    expect(callArgs.skill.repoName).toBe("repo-b");
    expect(callArgs.skill.name).toBe("Agent Browser B");
  });

  it("shows community trust metadata and a safety preview before installing", async () => {
    const browserSkill = makeSkillsShSkill({
      name: "Browser Automation",
      installs: 321,
    });
    setSearchResult("browser", 0, {
      skills: [browserSkill],
      totalCount: 1,
      query: "browser",
    });

    render(<SkillsPage initialApp="codex" initialSource="skillssh" />);
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "skills.skillssh.searchPlaceholder",
    );
    await user.type(input, "browser");
    await user.click(screen.getByRole("button", { name: "skills.search" }));

    expect(
      await screen.findByText("skills.market.communitySource"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("skills.market.unverifiedBadge").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText("skills.market.categories.automation"),
    ).toBeInTheDocument();
    expect(screen.getByText("skills.market.cardTarget")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "skills.view" }));
    expect(screen.getByText("skills.market.securityTitle")).toBeInTheDocument();
    expect(screen.getByText("owner-a")).toBeInTheDocument();
    expect(screen.getAllByText("owner-a/repo-a").length).toBeGreaterThanOrEqual(
      2,
    );

    await user.click(
      screen.getByRole("button", { name: "skills.market.installTo" }),
    );
    await waitFor(() => {
      expect(installMutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ currentApp: "codex" }),
      );
    });
  });

  it("keeps skills.sh results when submitting the same query again", async () => {
    const figmaSkill = makeSkillsShSkill({
      key: "figma-use:figma:mcp-server-guide",
      name: "figma-use",
      directory: "figma-use",
      repoOwner: "figma",
      repoName: "mcp-server-guide",
    });

    setSearchResult("figma", 0, {
      skills: [figmaSkill],
      totalCount: 1,
      query: "figma",
    });

    render(<SkillsPage initialApp="claude" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /skills\.sh/i }));
    const input = screen.getByPlaceholderText(
      "skills.skillssh.searchPlaceholder",
    );
    await user.type(input, "figma");

    const searchButton = screen.getByRole("button", {
      name: "skills.search",
    });
    await user.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("figma-use")).toBeInTheDocument();
    });

    await user.click(searchButton);

    expect(screen.getByText("figma-use")).toBeInTheDocument();
  });

  it("shows the skills.sh loading state while a new query is fetching", async () => {
    const figmaSkill = makeSkillsShSkill({
      key: "figma-use:figma:mcp-server-guide",
      name: "figma-use",
      directory: "figma-use",
      repoOwner: "figma",
      repoName: "mcp-server-guide",
    });

    setSearchResult("figma", 0, {
      skills: [figmaSkill],
      totalCount: 1,
      query: "figma",
    });
    setSearchResult("react", 0, undefined, { isFetching: true });

    render(<SkillsPage initialApp="claude" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /skills\.sh/i }));
    const input = screen.getByPlaceholderText(
      "skills.skillssh.searchPlaceholder",
    );
    await user.type(input, "figma");

    const searchButton = screen.getByRole("button", {
      name: "skills.search",
    });
    await user.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("figma-use")).toBeInTheDocument();
    });

    await user.clear(input);
    await user.type(input, "react");
    await user.click(searchButton);

    expect(screen.getByText("skills.skillssh.loading")).toBeInTheDocument();
  });

  it("shows a retry state instead of treating a search failure as zero results", async () => {
    setSearchResult("broken", 0, undefined, { isError: true });
    render(<SkillsPage initialApp="codex" initialSource="skillssh" />);
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "skills.skillssh.searchPlaceholder",
    );
    await user.type(input, "broken");
    await user.click(screen.getByRole("button", { name: "skills.search" }));

    expect(screen.getByText("skills.skillssh.error")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "common.refresh" }));
    expect(refetchSkillsShMock).toHaveBeenCalledTimes(1);
  });

  it("reports the effective skills.sh source to parent chrome", async () => {
    const onSourceChange = vi.fn();

    render(<SkillsPage initialApp="claude" onSourceChange={onSourceChange} />);

    await waitFor(() => {
      expect(onSourceChange).toHaveBeenCalledWith("skillssh");
    });
  });

  it("keeps the repository source when configured repositories return no discoverable skills", async () => {
    skillReposMock = [makeSkillRepo()];
    const onSourceChange = vi.fn();

    render(<SkillsPage initialApp="claude" onSourceChange={onSourceChange} />);

    await waitFor(() => {
      expect(onSourceChange).toHaveBeenCalledWith("repos");
    });
    expect(
      screen.getByPlaceholderText("skills.searchPlaceholder"),
    ).toBeVisible();
  });

  it("can switch back to repository results after discoverable skills refresh", async () => {
    const onSourceChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <SkillsPage initialApp="claude" onSourceChange={onSourceChange} />,
    );

    await waitFor(() => {
      expect(onSourceChange).toHaveBeenCalledWith("skillssh");
    });

    await user.click(screen.getByRole("button", { name: /skills\.sh/i }));

    discoverableSkillsMock = [makeDiscoverableSkill()];
    skillReposMock = [makeSkillRepo()];
    rerender(
      <SkillsPage initialApp="claude" onSourceChange={onSourceChange} />,
    );

    await user.click(
      screen.getByRole("button", { name: "skills.searchSource.repos" }),
    );

    expect(screen.getByText("Repo Skill")).toBeInTheDocument();
    expect(onSourceChange).toHaveBeenCalledWith("repos");
  });

  it("exposes repository-only header actions for the parent chrome", () => {
    expect(
      getSkillsPageHeaderActions("repos").map((action) => action.key),
    ).toEqual(["refresh-repos", "manage-repos"]);
    expect(
      getSkillsPageHeaderActions("skillssh").map((action) => action.key),
    ).toEqual(["manage-repos"]);
  });
});
