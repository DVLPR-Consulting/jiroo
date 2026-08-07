import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/releases", () => ({
  archiveReleaseAction: vi.fn(),
  createReleaseAction: vi.fn(),
  publishReleaseAction: vi.fn(),
  unarchiveReleaseAction: vi.fn(),
  unreleaseReleaseAction: vi.fn(),
  updateReleaseAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
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
    expect(archived).toHaveTextContent("8 / 13 points");
    expect(archived).toHaveTextContent("1 non estimé");

    expect(screen.getByRole("article", { name: "Version publiée" }))
      .toHaveTextContent("Publiée");
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
