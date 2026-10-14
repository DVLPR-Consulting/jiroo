import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listItemsAssignedTo: vi.fn(),
  requireAppPageSession: vi.fn(),
}));

vi.mock("@/components/shell/shell-breadcrumb", () => ({
  ShellBreadcrumb: () => <nav aria-label="Fil d’Ariane" />,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  requireAppPageSession: mocks.requireAppPageSession,
}));
vi.mock("@/lib/services/items", () => ({
  listItemsAssignedTo: mocks.listItemsAssignedTo,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/app/actions/items", () => ({ updateItemAction: vi.fn() }));

import MinePage from "@/app/(app)/mine/page";

function row(overrides: Record<string, unknown>) {
  return {
    id: "item-1",
    key: "CASS-1",
    type: "tache",
    kind: "feature",
    title: "Rédiger l’arrêt",
    priority: 3,
    estimatePoints: 5,
    statusId: "status-doing",
    statusName: "En cours",
    statusColor: "#d99a2b",
    statusCategory: "in_progress",
    rank: "a",
    backlogId: "backlog-cass",
    backlogKey: "CASS",
    backlogName: "Cour de cassation",
    backlogColor: "#7c3030",
    ...overrides,
  };
}

describe("MinePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAppPageSession.mockResolvedValue({ user: { id: "member-1" } });
  });

  it("lists the viewer's items as read-only Backlog rows grouped by backlog", async () => {
    mocks.listItemsAssignedTo.mockResolvedValue([
      row({}),
      row({
        id: "item-2",
        key: "CASS-2",
        type: "epic",
        kind: "bug",
        title: "Corriger la recherche",
        priority: 0,
        estimatePoints: null,
        statusName: "À faire",
        statusCategory: "todo",
      }),
    ]);

    render(await MinePage());

    expect(mocks.listItemsAssignedTo).toHaveBeenCalledWith("member-1");
    const section = screen.getByText("Cour de cassation").closest("section")!;
    const [task, epic] = within(section).getAllByRole("listitem");
    expect(within(task!).getByRole("link", { name: /CASS-1\s*Rédiger l’arrêt/ }))
      .toHaveAttribute("href", "/b/CASS?item=CASS-1");
    expect(within(task!).getByText("En cours")).toBeVisible();
    expect(within(task!).getByText("5 pts")).toBeInTheDocument();
    expect(within(task!).queryByRole("button")).not.toBeInTheDocument();
    expect(within(epic!).getByText("Bug")).toBeVisible();
    expect(within(epic!).getByText("À faire")).toBeVisible();
    // An epic is never estimated; the viewer is the assignee of every row.
    expect(within(epic!).queryByTitle("Points")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Non assigné" })).not.toBeInTheDocument();
  });

  it("frames each backlog in the Backlog card with counts and points (JIR-97)", async () => {
    mocks.listItemsAssignedTo.mockResolvedValue([
      row({}),
      row({ id: "item-2", key: "CASS-2", estimatePoints: null, statusCategory: "todo" }),
      row({ id: "item-3", key: "CASS-3", type: "epic", estimatePoints: null }),
      row({
        id: "item-4",
        key: "LABS-1",
        type: "epic",
        backlogId: "backlog-labs",
        backlogKey: "LABS",
        backlogName: "Laboratoire",
      }),
    ]);

    render(await MinePage());

    const cass = screen.getByRole("region", { name: "Cour de cassation" });
    expect(cass).toHaveAttribute("data-item-section");
    expect(within(cass).getByRole("heading", { level: 2, name: "CASS Cour de cassation" })).toBeVisible();
    // Only tasks are estimated: the epic neither counts nor adds points.
    expect(within(cass).getByText("3 items · 1 non estimé")).toBeVisible();
    expect(within(cass).getByText("Points par statut : À faire 0, En cours 5, Terminé 0"))
      .toBeInTheDocument();
    expect(within(cass).getAllByRole("listitem")).toHaveLength(3);
    // Read-only: no selection, no creation.
    expect(within(cass).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(cass).queryByRole("button", { name: /Créer/ })).not.toBeInTheDocument();

    const labs = screen.getByRole("region", { name: "Laboratoire" });
    expect(within(labs).getByText("1 item")).toBeVisible();
    expect(within(labs).queryByText(/Points par statut/)).not.toBeInTheDocument();
    expect(within(labs).getByRole("button", { name: "Replier Laboratoire" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("explains an empty list", async () => {
    mocks.listItemsAssignedTo.mockResolvedValue([]);
    render(await MinePage());
    expect(screen.getByText("Aucun item ne vous est assigné.")).toBeVisible();
  });
});
