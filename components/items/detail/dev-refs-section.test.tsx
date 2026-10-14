import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DevRefsSection } from "@/components/items/detail/dev-refs-section";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/actions/refs", () => ({
  addRefAction: vi.fn(),
  removeRefAction: vi.fn(),
}));

describe("DevRefsSection", () => {
  it("explains linking and lets a backlog admin connect a repository without link permission", () => {
    render(
      <DevRefsSection itemId="item-1" itemKey="CASS-1" backlogKey="CASS" refs={[]} canAdministerBacklog canLink={false} />,
    );

    expect(screen.getByText(/Aucun dépôt connecté\./)).toHaveTextContent(
      "Aucun dépôt connecté. Mettez la clé CASS-1 dans un nom de branche, un message de commit ou le titre d'une PR : elle sera liée automatiquement une fois le dépôt connecté.",
    );
    expect(screen.getByText("CASS-1")).toHaveClass("font-mono");
    expect(screen.getByRole("link", { name: "Connecter un dépôt" })).toHaveAttribute(
      "href", "/b/CASS/settings/development",
    );
    expect(screen.queryByText("Aucun lien de développement.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lier une PR ou un commit" })).not.toBeInTheDocument();
  });

  it("explains linking without offering repository settings to non-admins", () => {
    render(<DevRefsSection itemId="item-1" itemKey="CASS-1" backlogKey="CASS" refs={[]} />);

    expect(screen.getByText(/Aucun dépôt connecté\./)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connecter un dépôt" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lier une PR ou un commit" })).toBeInTheDocument();
  });

  it("explains active automatic linking even without link permission", () => {
    render(
      <DevRefsSection itemId="item-1" itemKey="CASS-1" backlogKey="CASS" refs={[]} hasRepoConnection canAdministerBacklog canLink={false} />,
    );

    expect(screen.getByText(/Liaison automatique active/)).toHaveTextContent(
      "Liaison automatique active : mettez la clé CASS-1 dans un nom de branche, un message de commit ou le titre d'une PR.",
    );
    expect(screen.getByText("CASS-1")).toHaveClass("font-mono");
    expect(screen.queryByText(/Aucun dépôt connecté/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connecter un dépôt" })).not.toBeInTheDocument();
  });

  it.each([false, true])("hides the hint when a detected reference exists (connected: %s)", (hasRepoConnection) => {
    render(
      <DevRefsSection
        itemId="item-1"
        itemKey="CASS-1"
        backlogKey="CASS"
        hasRepoConnection={hasRepoConnection}
        canAdministerBacklog
        refs={[{
          id: "detected-1",
          url: "https://github.com/acme/api/pull/42",
          kind: "pr",
          createdAt: "2026-10-13T08:00:00.000Z",
          provider: "github",
          title: "Login form",
          connectionId: hasRepoConnection ? "connection-1" : null,
        }]}
      />,
    );

    expect(screen.getByRole("link", { name: "#42 Login form" })).toBeInTheDocument();
    expect(screen.queryByText(/Aucun dépôt connecté|Liaison automatique active/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connecter un dépôt" })).not.toBeInTheDocument();
  });

  it("keeps development-reference removal in keyboard order without hover", async () => {
    const user = userEvent.setup();
    render(
      <DevRefsSection
        itemId="item-1"
        itemKey="CASS-1"
        backlogKey="CASS"
        refs={[
          {
            id: "ref-1",
            url: "https://github.com/openai/openai-node/pull/1",
            kind: "pr",
            createdAt: new Date("2026-08-04T10:00:00.000Z"),
          },
        ]}
      />,
    );

    const link = screen.getByRole("link", { name: "PR #1 · openai/openai-node" });
    expect(screen.getByText(/Aucun dépôt connecté\./)).toBeInTheDocument();
    const remove = screen.getByRole("button", {
      name: "Supprimer le lien PR #1 · openai/openai-node",
    });
    expect(remove).not.toHaveClass("hidden");
    link.focus();
    await user.tab();
    expect(remove).toHaveFocus();
  });

  it("keeps the URL form behind « Lier une PR ou un commit »", async () => {
    const user = userEvent.setup();
    render(<DevRefsSection itemId="item-1" itemKey="CASS-1" backlogKey="CASS" refs={[]} />);

    expect(screen.queryByRole("textbox", { name: "URL GitHub à ajouter" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Lier une PR ou un commit" }));
    const input = screen.getByRole("textbox", { name: "URL GitHub à ajouter" });
    expect(input).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "URL GitHub à ajouter" })).not.toBeInTheDocument();
  });

  it("groups references detected from repositories, with their state and forge (JIR-95)", async () => {
    const user = userEvent.setup();
    const commits = Array.from({ length: 7 }, (_, index) => ({
      id: `commit-${index}`,
      url: `https://github.com/acme/api/commit/${String(index).repeat(7)}abcdef`,
      kind: "commit",
      createdAt: "2026-10-13T08:00:00.000Z",
      provider: "github" as const,
      title: `CASS-1 commit ${index}`,
      authorName: "Alex Martin",
      state: null,
      occurredAt: `2026-10-0${index + 1}T08:00:00.000Z`,
    }));
    render(
      <DevRefsSection
        itemId="item-1"
        itemKey="CASS-1"
        backlogKey="CASS"
        refs={[
          {
            id: "manual-1",
            url: "https://github.com/acme/api/pull/9",
            kind: "pr",
            createdAt: "2026-10-01T08:00:00.000Z",
          },
          {
            id: "pr-1",
            url: "https://github.com/acme/api/pull/42",
            kind: "pr",
            createdAt: "2026-10-13T08:00:00.000Z",
            provider: "github",
            title: "Login form",
            authorName: "alex-m",
            state: "merged",
            occurredAt: "2026-10-13T10:00:00.000Z",
          },
          {
            id: "mr-1",
            url: "https://gitlab.example.invalid/g/api/-/merge_requests/7",
            kind: "pr",
            createdAt: "2026-10-12T08:00:00.000Z",
            provider: "gitlab",
            title: "Archive",
            authorName: "Camille Durand",
            state: "open",
            occurredAt: "2026-10-12T10:00:00.000Z",
          },
          {
            id: "branch-1",
            url: "https://github.com/acme/api/tree/feature/cass-1",
            kind: "branch",
            createdAt: "2026-10-12T08:00:00.000Z",
            provider: "github",
            title: "feature/cass-1",
            authorName: "alex-m",
            state: null,
            occurredAt: "2026-10-12T08:00:00.000Z",
          },
          ...commits,
        ]}
      />,
    );

    const pullRequests = screen.getByRole("group", { name: "Pull / merge requests" });
    const prLinks = within(pullRequests).getAllByRole("link");
    expect(prLinks.map((link) => link.textContent)).toEqual(["#42 Login form", "!7 Archive"]);
    expect(within(pullRequests).getByText("Fusionnée")).toBeInTheDocument();
    expect(within(pullRequests).getByText("Ouverte")).toBeInTheDocument();
    expect(within(pullRequests).getByRole("img", { name: "GitHub" })).toBeInTheDocument();
    expect(within(pullRequests).getByRole("img", { name: "GitLab" })).toBeInTheDocument();
    expect(within(pullRequests).getByText(/acme\/api · alex-m · /)).toBeInTheDocument();

    const branches = screen.getByRole("group", { name: "Branches" });
    expect(within(branches).getByRole("link", { name: /feature\/cass-1/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/api/tree/feature/cass-1",
    );

    const commitGroup = screen.getByRole("group", { name: "Commits (7)" });
    const shown = within(commitGroup).getAllByRole("link");
    expect(shown).toHaveLength(5);
    expect(shown[0]).toHaveTextContent("6666666 CASS-1 commit 6");
    await user.click(within(commitGroup).getByRole("button", { name: "Voir tout (7)" }));
    expect(within(commitGroup).getAllByRole("link")).toHaveLength(7);
    await user.click(within(commitGroup).getByRole("button", { name: "Réduire" }));
    expect(within(commitGroup).getAllByRole("link")).toHaveLength(5);

    // Only the manual link can be removed; detected references come back with the next webhook.
    expect(screen.getAllByRole("button", { name: /^Supprimer le lien/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Supprimer le lien PR #9 · acme/api" })).toBeInTheDocument();
  });

  it("lets a reference be removed once its connection is deleted (JIR-95)", async () => {
    const user = userEvent.setup();
    const { removeRefAction } = await import("@/app/actions/refs");
    vi.mocked(removeRefAction).mockResolvedValue({ ok: true });
    render(
      <DevRefsSection
        itemId="item-1"
        itemKey="CASS-1"
        backlogKey="CASS"
        refs={[
          {
            id: "orphan",
            url: "https://github.com/acme/api/pull/42",
            kind: "pr",
            createdAt: "2026-10-13T08:00:00.000Z",
            provider: "github",
            title: "Login form",
            state: "merged",
            connectionId: null,
          },
          {
            id: "live",
            url: "https://github.com/acme/api/pull/43",
            kind: "pr",
            createdAt: "2026-10-13T08:00:00.000Z",
            provider: "github",
            title: "Logout form",
            state: "open",
            connectionId: "connection-1",
          },
        ]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Supprimer le lien Logout form" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Supprimer le lien Login form" }));
    expect(removeRefAction).toHaveBeenCalledWith({ backlogKey: "CASS", id: "orphan" });
  });
});
