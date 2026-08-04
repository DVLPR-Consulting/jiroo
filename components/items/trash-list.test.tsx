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

vi.mock("@/app/actions/trash", () => ({
  purgeItemAction: vi.fn(),
  restoreTrashedItemAction: vi.fn(),
}));

function trashedItem(overrides: Partial<TrashedItem>): TrashedItem {
  return {
    id: "item-1",
    key: "DEMO-1",
    type: "tache",
    title: "Item supprimé",
    backlogKey: "DEMO",
    backlogName: "Démo",
    backlogColor: "#475569",
    statusId: "todo",
    statusName: "À faire",
    statusColor: "#9aa0a6",
    deletedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("TrashList", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("explains an empty trash and links back to the backlogs", () => {
    render(<TrashList groups={[]} />);

    expect(screen.getByRole("heading", { name: "Corbeille vide" })).toBeInTheDocument();
    expect(
      screen.getByText("Les items supprimés apparaîtront ici pendant 30 jours."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir les backlogs" })).toHaveAttribute("href", "/");
  });

  it("shows the restore deadline and disables only restore after expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));

    render(
      <TrashList
        groups={[
          {
            backlog: { key: "DEMO", name: "Démo", color: "#475569" },
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
});
