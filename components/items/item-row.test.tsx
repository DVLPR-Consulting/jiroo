import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ItemRow, RowSelectCheckbox, type ItemRowData } from "@/components/items/item-row";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/app/actions/items", () => ({ updateItemAction: vi.fn() }));

const statuses = [
  { id: "s-todo", name: "À faire", color: "#9aa0a6", category: "todo" as const, order: 0 },
  { id: "s-doing", name: "En cours", color: "#d99a2b", category: "in_progress" as const, order: 1 },
];

const editing = {
  backlogKey: "DEMO",
  statuses,
  users: [{ id: "u-1", name: "Ada Lovelace" }],
  canEdit: true,
  canTransition: true,
  canAssign: true,
};

const task: ItemRowData = {
  id: "i-1",
  key: "DEMO-1",
  title: "Écrire le guide",
  type: "tache",
  kind: "feature",
  statusId: "s-doing",
  priority: 2,
  estimatePoints: 3,
  assigneeId: "u-1",
  assigneeName: "Ada Lovelace",
};

function inTable(node: React.ReactNode) {
  return render(<div role="table">{node}</div>);
}

describe("ItemRow", () => {
  it("renders the Backlog fields with inline editors and opens the item", async () => {
    const onOpen = vi.fn();
    inTable(<ItemRow item={task} editing={editing} onOpen={onOpen} />);

    const row = screen.getByRole("row", { name: "DEMO-1 — Écrire le guide" });
    expect(row).toHaveAttribute("data-shortcut-item", "DEMO-1");
    expect(within(row).getByRole("button", { name: "Statut : En cours" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: /^Priorité :/ })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Estimation : 3 pts" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Assigné : Ada Lovelace" })).toBeInTheDocument();

    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);
    await userEvent.click(within(row).getByText("Écrire le guide"));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("shows the Bug and parent pills, and the optional pills it is given", () => {
    inTable(
      <ItemRow
        item={{
          ...task,
          kind: "bug",
          blocked: true,
          parent: { key: "DEMO-9", title: "Socle", type: "composant" },
          labels: [{ id: "l-1", name: "urgent", color: "--label-1" }],
          dueDate: "2026-10-20T00:00:00.000Z",
          fixVersions: [{ id: "r-1", name: "v1.0", released: false, archived: false }],
        }}
        editing={editing}
        onOpen={() => undefined}
      />,
    );

    const row = screen.getByRole("row");
    expect(within(row).getByText("Bug")).toBeInTheDocument();
    expect(within(row).getByText("bloqué")).toBeInTheDocument();
    expect(within(row).getByTitle("DEMO-9 — Socle")).toHaveTextContent("Socle");
    expect(within(row).getByText("urgent")).toBeInTheDocument();
    expect(within(row).getByTitle("Échéance")).toHaveTextContent("20 oct. 2026");
    expect(within(row).getByText("v1.0")).toBeInTheDocument();
  });

  it("hides the optional pills a context does not pass", () => {
    inTable(<ItemRow item={task} editing={editing} onOpen={() => undefined} />);

    const row = screen.getByRole("row");
    expect(within(row).queryByText("Bug")).not.toBeInTheDocument();
    expect(within(row).queryByTitle("Échéance")).not.toBeInTheDocument();
    expect(within(row).queryByText("urgent")).not.toBeInTheDocument();
  });

  it("keeps an empty points slot for a non-estimable editable row", () => {
    inTable(
      <ItemRow
        item={{ ...task, type: "epic", estimatePoints: undefined }}
        editing={editing}
        onOpen={() => undefined}
      />,
    );

    expect(screen.queryByRole("button", { name: /^Estimation/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Statut : En cours" })).toBeInTheDocument();
  });

  it("renders read-only fields without editors", () => {
    inTable(
      <ItemRow
        item={{
          id: "i-2",
          key: "DEMO-2",
          title: "Relire",
          type: "tache",
          status: { name: "En revue", category: "in_progress" },
          priority: 1,
          estimatePoints: 5,
          assigneeId: "u-1",
          assigneeName: "Ada Lovelace",
        }}
      />,
    );

    const row = screen.getByRole("row", { name: "DEMO-2 — Relire" });
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
    expect(within(row).getByText("En revue")).toBeInTheDocument();
    expect(within(row).getByText("5 pts")).toBeInTheDocument();
    expect(within(row).getByRole("img", { name: /Ada Lovelace/ })).toBeInTheDocument();
    expect(row).not.toHaveAttribute("tabindex");
  });

  it("links its identity in a list and keeps the context's trailing actions", async () => {
    const onRemove = vi.fn();
    render(
      <ul>
        <ItemRow
          as="li"
          item={{ id: "i-3", key: "DEMO-3", title: "Lier", type: "epic" }}
          href="/b/DEMO?item=DEMO-3"
          trailing={
            <button type="button" onClick={onRemove}>
              Retirer
            </button>
          }
        />
      </ul>,
    );

    const item = screen.getByRole("listitem");
    expect(within(item).getByRole("link", { name: /DEMO-3\s*Lier/ })).toHaveAttribute(
      "href",
      "/b/DEMO?item=DEMO-3",
    );
    await userEvent.click(within(item).getByRole("button", { name: "Retirer" }));
    expect(onRemove).toHaveBeenCalled();
  });

  it("renders a historical row without a type icon or link", () => {
    inTable(<ItemRow item={{ id: "i-4", key: "OLD-1", title: "Disparu", type: null }} />);
    const row = screen.getByRole("row", { name: "OLD-1 — Disparu" });
    expect(within(row).queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("RowSelectCheckbox", () => {
  it("toggles without opening the row and reports a shift range", async () => {
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    inTable(
      <ItemRow
        item={task}
        editing={editing}
        onOpen={onOpen}
        leading={<RowSelectCheckbox itemKey="DEMO-1" checked={false} onToggle={onToggle} />}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner DEMO-1" }));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner DEMO-1" }));
    await user.keyboard("{/Shift}");
    expect(onToggle).toHaveBeenNthCalledWith(1, false);
    expect(onToggle).toHaveBeenNthCalledWith(2, true);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
