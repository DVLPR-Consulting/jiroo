import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BacklogOverviewRow } from "@/lib/services/backlogs";

const mocks = vi.hoisted(() => ({ setBacklogStarAction: vi.fn() }));

vi.mock("@/app/actions/backlogs", () => ({
  setBacklogStarAction: mocks.setBacklogStarAction,
}));

import { BacklogOverview } from "@/components/backlogs/backlog-overview";
import { __resetToastsForTest, getSnapshot } from "@/lib/toast";

const rows: BacklogOverviewRow[] = [
  {
    id: "b2",
    key: "PEN",
    name: "Pôle pénal",
    color: "#2b6cb0",
    starred: true,
    openItemCount: 1,
    activeSprint: { id: "s1", name: "Sprint 4", completedPoints: 5, commitmentPoints: 13 },
    lead: { id: "u1", name: "Ada Lovelace" },
  },
  {
    id: "b1",
    key: "CASS",
    name: "Pôle civil",
    color: "#7c3030",
    starred: false,
    openItemCount: 12,
    activeSprint: null,
    lead: null,
  },
  {
    id: "b3",
    key: "OLD",
    name: "Reprise",
    color: "#475569",
    starred: false,
    openItemCount: 0,
    activeSprint: { id: "s2", name: "Sprint 1", completedPoints: 2.5, commitmentPoints: null },
    lead: null,
  },
];

function rowOf(key: string) {
  return document.querySelector<HTMLElement>(`[data-backlog-row="${key}"]`)!;
}

describe("BacklogOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetToastsForTest();
  });

  it("lists every backlog in the given order with its counters", () => {
    render(<BacklogOverview rows={rows} />);

    expect(screen.getByRole("heading", { level: 1, name: "Backlogs" })).toBeInTheDocument();
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Pôle pénal",
      "Pôle civil",
      "Reprise",
    ]);
    expect(screen.getByRole("link", { name: "Pôle civil" })).toHaveAttribute("href", "/b/CASS");

    const pen = within(rowOf("PEN"));
    expect(pen.getByText("PEN")).toBeInTheDocument();
    expect(rowOf("PEN").querySelector('[data-cell="open-items"]')).toHaveTextContent(
      "1 item ouvert",
    );
    expect(pen.getByText("Sprint 4")).toBeInTheDocument();
    expect(pen.getByText("5 pts terminés sur 13 pts engagés")).toBeInTheDocument();
    expect(pen.getByRole("img", { name: "Ada Lovelace" })).toBeInTheDocument();

    const civil = within(rowOf("CASS"));
    expect(rowOf("CASS").querySelector('[data-cell="open-items"]')).toHaveTextContent(
      "12 items ouverts",
    );
    expect(civil.getByText("Aucun sprint actif")).toBeInTheDocument();
    expect(rowOf("CASS").querySelector('[data-cell="lead"]')).toBeEmptyDOMElement();

    // A legacy active sprint has no start commitment to compare with.
    expect(within(rowOf("OLD")).getByText("2,5 pts terminés")).toHaveAttribute(
      "title",
      "Engagement au démarrage indisponible",
    );
  });

  it("exposes the favourite toggle state with a stable name", () => {
    render(<BacklogOverview rows={rows} />);

    const starred = screen.getByRole("button", { name: "Favori : Pôle pénal" });
    expect(starred).toHaveAttribute("aria-pressed", "true");
    expect(starred).toHaveAttribute("title", "Retirer des favoris");
    const unstarred = screen.getByRole("button", { name: "Favori : Pôle civil" });
    expect(unstarred).toHaveAttribute("aria-pressed", "false");
    expect(unstarred).toHaveAttribute("title", "Ajouter aux favoris");
  });

  it("stars a backlog at once through the action", async () => {
    const user = userEvent.setup();
    let resolve!: (value: { ok: true; starred: boolean }) => void;
    mocks.setBacklogStarAction.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<BacklogOverview rows={rows} />);

    await user.click(screen.getByRole("button", { name: "Favori : Pôle civil" }));

    expect(mocks.setBacklogStarAction).toHaveBeenCalledWith({ backlogId: "b1", starred: true });
    expect(
      screen.getByRole("button", { name: "Favori : Pôle civil" }),
    ).toHaveAttribute("aria-pressed", "true");
    await act(async () => resolve({ ok: true, starred: true }));
  });

  it("restores the star and reports a refused request", async () => {
    const user = userEvent.setup();
    mocks.setBacklogStarAction.mockResolvedValue({
      ok: false,
      error: "La ressource demandée est introuvable.",
    });
    render(<BacklogOverview rows={rows} />);

    await user.click(screen.getByRole("button", { name: "Favori : Pôle pénal" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Favori : Pôle pénal" }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    expect(getSnapshot().map((toast) => toast.message)).toEqual([
      "La ressource demandée est introuvable.",
    ]);
  });

  it("keeps the empty state when no backlog is accessible", () => {
    render(<BacklogOverview rows={[]} />);

    expect(screen.getByRole("heading", { name: "Aucun backlog" })).toBeInTheDocument();
    expect(
      screen.getByText("Un administrateur peut en créer un dans l’administration."),
    ).toBeInTheDocument();
  });
});
