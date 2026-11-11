import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ItemRowIconProvider, RowGripIcon, RowPrioIcon, RowStatusDot, RowTypeIcon,
} from "./item-row-icons";

function Icons() {
  return <><RowTypeIcon type="tache" /><RowStatusDot status="doing" /><RowPrioIcon priority={2} /><RowGripIcon /></>;
}

describe("shared row drawings", () => {
  it("keeps the original accessible names and hides its definitions and drag decoration", () => {
    render(<ItemRowIconProvider><Icons /></ItemRowIconProvider>);
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByRole("img", { name: "Tâche" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "En cours" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Moyenne" })).toBeInTheDocument();
  });

  it("keeps each view's references unique, including rows added after the first window", () => {
    const view = (more: boolean) => (
      <>
        <ItemRowIconProvider><section aria-label="Liste"><Icons />{more && <Icons />}</section></ItemRowIconProvider>
        <ItemRowIconProvider><section aria-label="Backlog"><Icons /></section></ItemRowIconProvider>
      </>
    );
    const { container, rerender } = render(view(false));
    const original = within(screen.getByRole("region", { name: "Liste" })).getByRole("img", { name: "Tâche" }).querySelector("use")!.getAttribute("href");
    rerender(view(true));
    const symbols = [...container.querySelectorAll("symbol")];
    expect(new Set(symbols.map((symbol) => symbol.id)).size).toBe(symbols.length);
    const refs = [...container.querySelectorAll("use")].map((use) => use.getAttribute("href")!.slice(1));
    for (const id of refs) expect(symbols.filter((symbol) => symbol.id === id)).toHaveLength(1);
    const tasks = within(screen.getByRole("region", { name: "Liste" })).getAllByRole("img", { name: "Tâche" });
    expect(tasks).toHaveLength(2);
    for (const task of tasks) expect(task.querySelector("use")).toHaveAttribute("href", original);
  });

  it("renders the existing full icons when used outside a list view provider", () => {
    const { container } = render(<Icons />);
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(container.querySelector("use")).toBeNull();
    expect(container.querySelector("rect")).not.toBeNull();
  });
});
