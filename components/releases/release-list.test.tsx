import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  reorderReleaseAction: vi.fn(),
}));

vi.mock("@/app/actions/releases", () => ({
  archiveReleaseAction: vi.fn(),
  createReleaseAction: vi.fn(),
  deleteReleaseAction: vi.fn(),
  mergeReleaseAction: vi.fn(),
  publishReleaseAction: vi.fn(),
  reorderReleaseAction: listMocks.reorderReleaseAction,
  unarchiveReleaseAction: vi.fn(),
  unreleaseReleaseAction: vi.fn(),
  updateReleaseAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: listMocks.refresh, push: vi.fn() }),
}));
import { ReleaseList } from "@/components/releases/release-list";

const baseProps = {
  backlog: {
    id: "11111111-1111-4111-8111-111111111111",
    key: "CASS",
    name: "Cassini",
  },
  releases: [],
  showArchived: false,
  actor: { id: "actor-1", name: "Ada" },
  driverOptions: [] as Array<{ id: string; name: string }>,
  canBrowseUsers: false,
  statusIds: {
    todo: ["todo-1"],
    inProgress: ["doing-1"],
    done: ["done-1"],
  },
  capabilities: {
    manage: false,
    assignItems: false,
    bulkAssignItems: false,
  },
};

describe("ReleaseList", () => {
  it("explains the empty Versions state without exposing creation to a reader", () => {
    render(<ReleaseList {...baseProps} />);

    expect(screen.getByRole("heading", { name: "Aucune version" })).toBeVisible();
    expect(screen.getByText(/planifier les livraisons/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Créer une version" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Afficher les versions archivées" }))
      .toHaveAttribute("href", "/b/CASS/releases?archived=1");
  });

  it("offers creation from the empty state only to a release manager", () => {
    render(
      <ReleaseList
        {...baseProps}
        capabilities={{ ...baseProps.capabilities, manage: true }}
      />,
    );

    expect(screen.getByRole("button", { name: "Créer une version" })).toBeVisible();
  });

  it("shows lifecycle precedence, dates, driver, overdue state, counts, and points", () => {
    render(
      <ReleaseList
        {...baseProps}
        releases={[
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Version archivée",
            description: null,
            driver: { id: "driver-2", name: "Lin" },
            startDate: "2026-09-01",
            targetDate: "2026-09-30",
            effectiveReleaseDate: "2026-09-28",
            released: true,
            archived: true,
            overdue: true,
            revision: 4,
            publicationScopeRevision: "0123456789abcdef0123456789abcdef",
            publicationCount: 0,
            removalScope: { revision: "0123456789abcdef0123456789abcdef", linkedCount: 0, trashedCount: 0 },
            progress: {
              total: 6,
              todo: 2,
              inProgress: 1,
              done: 3,
              totalPoints: 13,
              donePoints: 8,
              unestimated: 1,
            },
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Version publiée",
            description: null,
            driver: null,
            startDate: null,
            targetDate: null,
            effectiveReleaseDate: "2026-10-01",
            released: true,
            archived: false,
            overdue: false,
            revision: 2,
            publicationScopeRevision: "0123456789abcdef0123456789abcdef",
            publicationCount: 0,
            removalScope: { revision: "0123456789abcdef0123456789abcdef", linkedCount: 0, trashedCount: 0 },
            progress: {
              total: 0,
              todo: 0,
              inProgress: 0,
              done: 0,
              totalPoints: 0,
              donePoints: 0,
              unestimated: 0,
            },
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            name: "Version en retard",
            description: null,
            driver: null,
            startDate: null,
            targetDate: "2026-08-01",
            effectiveReleaseDate: null,
            released: false,
            archived: false,
            overdue: true,
            revision: 1,
            publicationScopeRevision: "0123456789abcdef0123456789abcdef",
            publicationCount: 0,
            removalScope: { revision: "0123456789abcdef0123456789abcdef", linkedCount: 0, trashedCount: 0 },
            progress: {
              total: 0,
              todo: 0,
              inProgress: 0,
              done: 0,
              totalPoints: 0,
              donePoints: 0,
              unestimated: 0,
            },
          },
        ]}
      />,
    );

    const archived = screen.getByRole("article", { name: "Version archivée" });
    expect(archived).toHaveTextContent("Archivée");
    expect(archived).not.toHaveTextContent("Publiée");
    expect(archived).toHaveTextContent("Lin");
    expect(archived).toHaveTextContent("1 sept. 2026");
    expect(archived).toHaveTextContent("30 sept. 2026");
    expect(archived).toHaveTextContent("3 terminés sur 6");
    expect(archived).toHaveTextContent("3 éléments non terminés");
    expect(within(archived).getByRole("link", { name: "3 terminés sur 6" }))
      .toHaveAttribute("href", "/b/CASS/releases/22222222-2222-4222-8222-222222222222");
    expect(archived).toHaveTextContent("8 points terminés");
    expect(archived).toHaveTextContent("13 points estimés");
    expect(archived).toHaveTextContent("1 non estimé");

    expect(screen.getByRole("article", { name: "Version publiée" }))
      .toHaveTextContent("Publiée");
    expect(screen.getByRole("article", { name: "Version publiée" }))
      .toHaveTextContent("0 éléments non terminés");
    const overdue = screen.getByRole("article", { name: "Version en retard" });
    expect(overdue).toHaveTextContent("Non publiée");
    expect(overdue).toHaveTextContent("En retard");
    expect(screen.getByRole("link", { name: "Version archivée" })).toHaveAttribute(
      "href",
      "/b/CASS/releases/22222222-2222-4222-8222-222222222222",
    );
  });

  it("offers a URL-backed archived toggle and a complete manager action menu", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    render(
      <ReleaseList
        {...baseProps}
        showArchived
        capabilities={{ ...baseProps.capabilities, manage: true, assignItems: true }}
        releases={[{
          id: "44444444-4444-4444-8444-444444444444",
          name: "Version active",
          description: null,
          driver: null,
          startDate: null,
          targetDate: null,
          effectiveReleaseDate: null,
          released: false,
          archived: false,
          overdue: false,
          revision: 1,
          publicationScopeRevision: "0123456789abcdef0123456789abcdef",
          publicationCount: 0,
          removalScope: { revision: "0123456789abcdef0123456789abcdef", linkedCount: 0, trashedCount: 0 },
          progress: { total: 0, todo: 0, inProgress: 0, done: 0, totalPoints: 0, donePoints: 0, unestimated: 0 },
        }]}
      />,
    );

    expect(screen.getByRole("link", { name: "Masquer les versions archivées" }))
      .toHaveAttribute("href", "/b/CASS/releases");
    expect(screen.getByText("Actions pour Version active")).toBeVisible();
    await user.click(screen.getByText("Actions pour Version active"));
    expect(screen.getByRole("button", { name: "Modifier Version active" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Publier Version active" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Archiver Version active" })).toBeVisible();
  });
});

function summary(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name,
    description: null,
    driver: null,
    startDate: null,
    targetDate: null,
    effectiveReleaseDate: null,
    released: false,
    archived: false,
    overdue: false,
    revision: 3,
    publicationScopeRevision: "0123456789abcdef0123456789abcdef",
    publicationCount: 0,
    removalScope: { revision: "0123456789abcdef0123456789abcdef", linkedCount: 0, trashedCount: 0 },
    progress: { total: 0, todo: 0, inProgress: 0, done: 0, totalPoints: 0, donePoints: 0, unestimated: 0 },
    ...overrides,
  };
}

const ids = {
  a: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  b: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  c: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};
const ordered = [summary(ids.a, "Alpha"), summary(ids.b, "Bêta"), summary(ids.c, "Gamma")];
const manager = { ...baseProps.capabilities, manage: true };

function articleNames() {
  return screen.getAllByRole("article").map((article) => article.getAttribute("aria-label"));
}

describe("ReleaseList manual order", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers drag handles and Monter/Descendre only to managers in the default view", () => {
    const { rerender } = render(<ReleaseList {...baseProps} releases={ordered} capabilities={manager} />);
    expect(screen.getByRole("button", { name: "Réordonner Alpha" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Monter Alpha" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Descendre Gamma" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Monter Bêta" })).toBeEnabled();

    rerender(<ReleaseList {...baseProps} releases={ordered} capabilities={manager} showArchived />);
    expect(screen.queryByRole("button", { name: "Réordonner Alpha" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Monter Bêta" })).not.toBeInTheDocument();
    expect(screen.getByText(/masquez les versions archivées pour modifier l’ordre/i)).toBeVisible();

    rerender(<ReleaseList {...baseProps} releases={ordered} />);
    expect(screen.queryByRole("button", { name: "Réordonner Alpha" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Monter Bêta" })).not.toBeInTheDocument();
  });

  it("moves a version up with its new neighbours and refreshes", async () => {
    listMocks.reorderReleaseAction.mockResolvedValueOnce({ ok: true, result: {} });
    const user = userEvent.setup();
    render(<ReleaseList {...baseProps} releases={ordered} capabilities={manager} />);
    await user.click(screen.getByRole("button", { name: "Monter Gamma" }));

    expect(articleNames()).toEqual(["Alpha", "Gamma", "Bêta"]);
    await waitFor(() =>
      expect(listMocks.reorderReleaseAction).toHaveBeenCalledWith({
        backlogId: baseProps.backlog.id,
        backlogKey: "CASS",
        releaseId: ids.c,
        expectedRevision: 3,
        beforeId: ids.a,
        afterId: ids.b,
      }),
    );
    await waitFor(() => expect(listMocks.refresh).toHaveBeenCalled());
  });

  it("uses the revision returned by the server for a second move of the same version", async () => {
    listMocks.reorderReleaseAction
      .mockResolvedValueOnce({ ok: true, result: { id: ids.c, revision: 4, rank: "a0" } })
      .mockResolvedValueOnce({ ok: true, result: { id: ids.c, revision: 5, rank: "Zz" } });
    const user = userEvent.setup();
    render(<ReleaseList {...baseProps} releases={ordered} capabilities={manager} />);
    await user.click(screen.getByRole("button", { name: "Monter Gamma" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Monter Gamma" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Monter Gamma" }));
    await waitFor(() => expect(listMocks.reorderReleaseAction).toHaveBeenCalledTimes(2));
    expect(listMocks.reorderReleaseAction.mock.calls[1]?.[0]).toMatchObject({
      releaseId: ids.c,
      expectedRevision: 4,
      beforeId: null,
      afterId: ids.a,
    });
    expect(articleNames()).toEqual(["Gamma", "Alpha", "Bêta"]);
  });

  it("rolls back to the latest server order when a refresh landed during the request", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    listMocks.reorderReleaseAction.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    const user = userEvent.setup();
    const { rerender } = render(<ReleaseList {...baseProps} releases={ordered} capabilities={manager} />);
    await user.click(screen.getByRole("button", { name: "Monter Gamma" }));
    const refreshed = [ordered[1]!, ordered[0]!, ordered[2]!];
    rerender(<ReleaseList {...baseProps} releases={refreshed} capabilities={manager} />);
    resolve({ ok: false, error: "Voisin invalide pour ce backlog." });
    expect(await screen.findByRole("alert")).toHaveTextContent("Voisin invalide");
    expect(articleNames()).toEqual(["Bêta", "Alpha", "Gamma"]);
  });

  it("moves a version down to the last position", async () => {
    listMocks.reorderReleaseAction.mockResolvedValueOnce({ ok: true, result: {} });
    const user = userEvent.setup();
    render(<ReleaseList {...baseProps} releases={ordered} capabilities={manager} />);
    await user.click(screen.getByRole("button", { name: "Descendre Bêta" }));
    await waitFor(() =>
      expect(listMocks.reorderReleaseAction).toHaveBeenCalledWith(
        expect.objectContaining({ releaseId: ids.b, beforeId: ids.c, afterId: null }),
      ),
    );
  });

  it("rolls back the optimistic order and announces the failure", async () => {
    listMocks.reorderReleaseAction.mockResolvedValueOnce({
      ok: false,
      error: "Voisin invalide pour ce backlog.",
    });
    const user = userEvent.setup();
    render(<ReleaseList {...baseProps} releases={ordered} capabilities={manager} />);
    await user.click(screen.getByRole("button", { name: "Monter Bêta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Voisin invalide pour ce backlog.");
    expect(articleNames()).toEqual(["Alpha", "Bêta", "Gamma"]);
    expect(listMocks.refresh).not.toHaveBeenCalled();
  });

  it("rolls back on a network failure", async () => {
    listMocks.reorderReleaseAction.mockRejectedValueOnce(new Error("Failed to fetch"));
    const user = userEvent.setup();
    render(<ReleaseList {...baseProps} releases={ordered} capabilities={manager} />);
    await user.click(screen.getByRole("button", { name: "Descendre Alpha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Réordonnancement impossible.");
    expect(articleNames()).toEqual(["Alpha", "Bêta", "Gamma"]);
  });

  it("offers Fusionner… and Supprimer… only to managers", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ReleaseList {...baseProps} releases={ordered} capabilities={manager} />);
    await user.click(screen.getByText("Actions pour Alpha"));
    expect(screen.getByRole("button", { name: "Fusionner Alpha" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Supprimer Alpha" })).toBeVisible();

    rerender(<ReleaseList {...baseProps} releases={ordered} />);
    expect(screen.queryByRole("button", { name: "Fusionner Alpha" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer Alpha" })).not.toBeInTheDocument();
  });
});
