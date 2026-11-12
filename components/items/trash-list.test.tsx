import userEvent from "@testing-library/user-event";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrashList } from "@/components/items/trash-list";
import type { TrashedItem } from "@/lib/services/items";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/actions/items", () => ({ updateItemAction: vi.fn() }));

vi.mock("@/app/actions/trash", () => ({
  purgeItemAction: vi.fn(),
  restoreTrashedItemAction: vi.fn(),
}));

function trashedItem(overrides: Partial<TrashedItem>): TrashedItem {
  return {
    id: "item-1",
    key: "DEMO-1",
    type: "tache",
    kind: "feature",
    title: "Item supprimé",
    backlogId: "backlog-demo",
    backlogKey: "DEMO",
    backlogName: "Démo",
    backlogColor: "#475569",
    statusId: "todo",
    statusName: "À faire",
    statusColor: "#9aa0a6",
    statusCategory: "todo",
    deletedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("TrashList", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("explains an empty trash and links back to the backlogs", () => {
    render(<TrashList groups={[]} restorableBacklogIds={[]} />);

    expect(screen.getByRole("heading", { name: "Corbeille vide" })).toBeInTheDocument();
    expect(
      screen.getByText("Les items supprimés apparaîtront ici pendant 30 jours."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir les backlogs" })).toHaveAttribute("href", "/");
  });

  it("frames each backlog of the trash in a collapsible Backlog card (JIR-97)", async () => {
    const user = userEvent.setup();
    render(
      <TrashList
        restorableBacklogIds={["backlog-demo"]}
        groups={[
          {
            backlog: { id: "backlog-demo", key: "DEMO", name: "Démo", color: "#475569" },
            items: [trashedItem({}), trashedItem({ id: "item-2", key: "DEMO-2" })],
          },
          {
            backlog: { id: "backlog-labs", key: "LABS", name: "Labo", color: "#0f766e" },
            items: [trashedItem({ id: "item-3", key: "LABS-1", backlogId: "backlog-labs" })],
          },
        ]}
      />,
    );

    const demo = screen.getByRole("region", { name: "Démo" });
    expect(demo).toHaveAttribute("data-item-section");
    expect(within(demo).getByRole("heading", { level: 2, name: "DEMO Démo" })).toBeVisible();
    // Deleted items have no points: only the count.
    expect(within(demo).getByText("2 items")).toBeVisible();
    expect(within(demo).queryByText(/Points par statut/)).not.toBeInTheDocument();
    expect(within(demo).getAllByRole("button", { name: "Restaurer" })).toHaveLength(2);
    expect(within(screen.getByRole("region", { name: "Labo" })).getByText("1 item")).toBeVisible();

    await user.click(within(demo).getByRole("button", { name: "Replier Démo" }));
    expect(within(demo).queryByRole("listitem")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Labo" })).getByRole("listitem")).toBeVisible();
  });

  it("shows the restore deadline and disables only restore after expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

    render(
      <TrashList
        restorableBacklogIds={["backlog-demo"]}
        groups={[
          {
            backlog: { id: "backlog-demo", key: "DEMO", name: "Démo", color: "#475569" },
            items: [
              trashedItem({ id: "active", key: "DEMO-1" }),
              trashedItem({
                id: "expired",
                key: "DEMO-2",
                deletedAt: new Date("2025-12-01T00:00:00.000Z"),
              }),
            ],
          },
        ]}
      />,
    );

    const [activeRow, expiredRow] = screen.getAllByRole("listitem");

    expect(within(activeRow!).getByText("Restaurable jusqu’au 31/01/2026")).toBeInTheDocument();
    expect(within(activeRow!).getByRole("button", { name: "Restaurer" })).toBeEnabled();
    expect(
      within(activeRow!).getByRole("button", { name: "Supprimer définitivement" }),
    ).toBeEnabled();

    expect(within(expiredRow!).getByText("Délai expiré")).toBeInTheDocument();
    expect(within(expiredRow!).getByRole("button", { name: "Restaurer" })).toBeDisabled();
    expect(
      within(expiredRow!).getByRole("button", { name: "Supprimer définitivement" }),
    ).toBeEnabled();
  });

  it("shows each deleted item as the Backlog row, without a link to open it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-03T12:00:00.000Z"));

    render(
      <TrashList
        restorableBacklogIds={["backlog-demo"]}
        groups={[
          {
            backlog: { id: "backlog-demo", key: "DEMO", name: "Démo", color: "#475569" },
            items: [trashedItem({ kind: "bug", statusName: "En cours", statusCategory: "in_progress" })],
          },
        ]}
      />,
    );

    const row = screen.getByRole("listitem");
    expect(within(row).getByText("DEMO-1")).toHaveClass("ir-key");
    expect(within(row).getByText("Bug")).toBeVisible();
    expect(within(row).getByRole("img", { name: "En cours" })).toBeVisible();
    expect(within(row).getByText("supprimé il y a 2 jours")).toBeVisible();
    expect(within(row).queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps reader trash data visible without restore or permanent-delete controls", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

    render(
      <TrashList
        groups={[
          {
            backlog: { id: "backlog-demo", key: "DEMO", name: "Démo", color: "#475569" },
            items: [trashedItem({})],
          },
        ]}
        restorableBacklogIds={[]}
      />,
    );

    expect(screen.getByText("Item supprimé")).toBeVisible();
    expect(screen.getByText("À faire")).toBeVisible();
    expect(screen.getByText("DEMO-1")).toBeVisible();
    expect(screen.getByText("Restaurable jusqu’au 31/01/2026")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Restaurer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer définitivement" }))
      .not.toBeInTheDocument();
  });
});
