import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReleaseDetail } from "@/components/releases/release-detail";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/actions/releases", () => ({
  archiveReleaseAction: vi.fn(),
  deleteReleaseAction: vi.fn(),
  mergeReleaseAction: vi.fn(),
  publishReleaseAction: vi.fn(),
  unarchiveReleaseAction: vi.fn(),
  unreleaseReleaseAction: vi.fn(),
  updateReleaseAction: vi.fn(),
}));

const props = {
  backlog: { id: "11111111-1111-4111-8111-111111111111", key: "CASS", name: "Cassini" },
  release: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Version 1",
    description: "Livraison majeure",
    driver: { id: "driver-2", name: "Lin" },
    startDate: "2026-09-01",
    targetDate: "2026-09-30",
    effectiveReleaseDate: "2026-09-28",
    released: true,
    archived: false,
    overdue: false,
    revision: 4,
    publicationScopeRevision: "0123456789abcdef0123456789abcdef",
    publicationCount: 0,
    removalScope: { revision: "0123456789abcdef0123456789abcdef", linkedCount: 0, trashedCount: 0 },
    progress: { total: 1, todo: 0, inProgress: 0, done: 1, totalPoints: 5, donePoints: 5, unestimated: 0 },
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-02T10:00:00.000Z",
  },
  actor: { id: "actor-1", name: "Ada" },
  driverOptions: [] as Array<{ id: string; name: string }>,
  canBrowseUsers: false,
  capabilities: { manage: false, assignItems: false, bulkAssignItems: false },
  statusIds: { todo: ["todo-1"], inProgress: ["doing-1"], done: ["done-1"] },
  destinations: [{ id: "33333333-3333-4333-8333-333333333333", name: "Version 2" }],
  mergeTargets: [
    { id: "33333333-3333-4333-8333-333333333333", name: "Version 2", revision: 2, released: false },
  ],
  scope: {
    page: 1,
    total: 1,
    rows: [{
      id: "item-current",
      key: "CASS-1",
      title: "Titre actuel modifié",
      type: "tache" as const,
      kind: "feature" as const,
      status: { id: "done-1", name: "Terminé maintenant", category: "done" as const, color: "#00aa00" },
      estimatePoints: 8,
    }],
  },
  events: {
    page: 1,
    total: 1,
    rows: [{
      id: "event-1",
      publicationId: "44444444-4444-4444-8444-444444444444",
      actorName: "Ada",
      action: "release_published",
      createdAt: "2026-09-28T12:00:00.000Z",
    }],
  },
  snapshot: {
    publicationId: "44444444-4444-4444-8444-444444444444",
    page: 1,
    total: 1,
    rows: [{
      id: "snapshot-1",
      itemId: "item-current",
      itemKey: "CASS-1",
      itemTitle: "Titre publié original",
      itemType: "tache" as const,
      statusId: "55555555-5555-4555-8555-555555555555",
      statusName: "Terminé à publication",
      statusCategory: "done" as const,
      completed: true,
      estimatePoints: 5,
      disposition: "moved" as const,
      destinationRelease: { id: "33333333-3333-4333-8333-333333333333", name: "Version 2" },
    }],
  },
  scopeFilters: { statusCategory: null, estimate: null },
};

describe("ReleaseDetail", () => {
  it("keeps current scope distinct from the immutable publication snapshot", () => {
    render(<ReleaseDetail {...props} />);

    const current = screen.getByRole("region", { name: "Périmètre actuel" });
    expect(current).toHaveTextContent("Titre actuel modifié");
    expect(current).toHaveTextContent("Terminé maintenant");
    expect(current).toHaveTextContent("8 points");
    expect(current).not.toHaveTextContent("Titre publié original");
    expect(screen.getByRole("link", { name: "CASS-1 — Titre actuel modifié" }))
      .toHaveAttribute("href", "/b/CASS?item=CASS-1");

    const snapshot = screen.getByRole("region", { name: "Instantané de publication" });
    expect(snapshot).toHaveTextContent("Copie immuable");
    expect(snapshot).toHaveTextContent("Titre publié original");
    expect(snapshot).toHaveTextContent("Terminé à publication");
    expect(snapshot).toHaveTextContent("Terminée à la publication");
    expect(snapshot).toHaveTextContent("Déplacée vers Version 2");
    expect(snapshot).toHaveTextContent("5 points");
    expect(snapshot).not.toHaveTextContent("Titre actuel modifié");
  });

  it("renders safe event summaries, no nested main, and no lifecycle controls for a reader", () => {
    render(<ReleaseDetail {...props} />);

    expect(screen.getByRole("region", { name: "Historique" }))
      .toHaveTextContent("Ada a publié la version");
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publier|archiver|annuler/i }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir l’instantané" })).toHaveAttribute(
      "href",
      `/b/CASS/releases/${props.release.id}?snapshot=${props.snapshot.publicationId}&scopePage=1&eventPage=1`,
    );
  });

  it("preserves the other independently paginated sections in every pager", () => {
    render(
      <ReleaseDetail
        {...props}
        scope={{ ...props.scope, page: 2, total: 60 }}
        events={{ ...props.events, page: 3, total: 60 }}
        snapshot={{ ...props.snapshot, page: 4, total: 100 }}
      />,
    );

    const expectedState = [
      `snapshot=${props.snapshot.publicationId}`,
      "scopePage=",
      "eventPage=",
      "snapshotPage=",
    ];
    for (const name of ["Pagination scopePage", "Pagination eventPage", "Pagination snapshotPage"]) {
      const pager = screen.getByRole("navigation", { name });
      const href = within(pager).getByRole("link", { name: "Précédent" }).getAttribute("href");
      for (const parameter of expectedState) expect(href).toContain(parameter);
    }
  });

  it("warns about incomplete work, explains Done, and exposes URL-backed scope filters", () => {
    render(
      <ReleaseDetail
        {...props}
        release={{
          ...props.release,
          released: false,
          effectiveReleaseDate: null,
          progress: { ...props.release.progress, total: 3, todo: 1, inProgress: 1, done: 1 },
        }}
        scopeFilters={{ statusCategory: "in_progress", estimate: "unestimated" }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("2 éléments non terminés");
    expect(screen.getByText(/terminé signifie que le statut appartient à la catégorie/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "En cours" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Non estimés" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "À faire" }).getAttribute("href"))
      .toContain("scopeStatus=todo");
  });

  it("warns when the mutable current scope gains incompletes after publication", () => {
    render(
      <ReleaseDetail
        {...props}
        release={{
          ...props.release,
          released: true,
          progress: { ...props.release.progress, total: 2, todo: 1, done: 1 },
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("1 élément non terminé");
    expect(screen.getByRole("alert")).toHaveTextContent("périmètre actuel");
  });
});

describe("ReleaseDetail merge and delete", () => {
  it("offers Fusionner… and Supprimer… to a manager only", () => {
    const { rerender } = render(
      <ReleaseDetail {...props} capabilities={{ ...props.capabilities, manage: true }} />,
    );
    expect(screen.getByRole("button", { name: "Fusionner Version 1" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Supprimer Version 1" })).toBeVisible();
    rerender(<ReleaseDetail {...props} />);
    expect(screen.queryByRole("button", { name: "Fusionner Version 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer Version 1" })).not.toBeInTheDocument();
  });

  it("labels reorder and received-items events", () => {
    render(
      <ReleaseDetail
        {...props}
        events={{
          page: 1,
          total: 2,
          rows: [
            { id: "e1", publicationId: null, actorName: "Ada", action: "release_reordered", createdAt: "2026-09-28T12:00:00.000Z" },
            { id: "e2", publicationId: null, actorName: "Lin", action: "release_items_received", createdAt: "2026-09-28T12:00:00.000Z" },
          ],
        }}
      />,
    );
    const history = screen.getByRole("region", { name: "Historique" });
    expect(history).toHaveTextContent("Ada a déplacé la version dans l’ordre des versions");
    expect(history).toHaveTextContent("Lin a reçu les éléments d’une version fusionnée ou supprimée");
  });
});

describe("ReleaseDetail release notes", () => {
  it("links every backlog reader to the release notes", () => {
    render(<ReleaseDetail {...props} />);
    expect(screen.getByRole("link", { name: "Notes de release" })).toHaveAttribute(
      "href",
      `/b/CASS/releases/${props.release.id}/notes`,
    );
  });
});
