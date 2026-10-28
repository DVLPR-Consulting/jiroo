import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ItemPicker, type ItemChoice, type ItemPickerSearch } from "@/components/items/item-picker";

vi.mock("@/app/actions/item-choices", () => ({ searchBacklogItemsAction: vi.fn() }));

const epics: ItemChoice[] = [
  { id: "e1", key: "CASS-2", type: "epic", title: "Connexion" },
  { id: "e2", key: "CASS-3", type: "epic", title: "Recherche documentaire" },
  { id: "e3", key: "CASS-9", type: "epic", title: "Notifications" },
];

/** A search over the epics above: a query keeps the titles containing it. */
function searchOf(choices: ItemChoice[] = epics, limit = 20): ItemPickerSearch {
  return vi.fn(async ({ q = "" }) => ({
    ok: true as const,
    items: choices.filter((item) => item.title.toLowerCase().includes(q.toLowerCase())),
    limit,
  }));
}

function renderPicker(props: Partial<React.ComponentProps<typeof ItemPicker>> = {}) {
  const onChange = vi.fn();
  const search = props.search ?? searchOf();
  const utils = render(
    <ItemPicker
      backlogKey="CASS"
      types={["epic"]}
      value={null}
      onChange={onChange}
      aria-label="Parent"
      debounceMs={0}
      {...props}
      search={search}
    />,
  );
  return { ...utils, onChange, search };
}

describe("ItemPicker", () => {
  it("opens on focus with the first choices of the asked level, then picks with the keyboard", async () => {
    const user = userEvent.setup();
    const { onChange, search } = renderPicker();
    const input = screen.getByRole("combobox", { name: "Parent" });
    expect(input).toHaveAttribute("aria-expanded", "false");

    await user.click(input);
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "CASS-2Connexion",
      "CASS-3Recherche documentaire",
      "CASS-9Notifications",
    ]);
    expect(search).toHaveBeenCalledWith({ backlogKey: "CASS", q: "", types: ["epic"] });
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-activedescendant", options[0]!.id);

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith(epics[1]);
    expect(input).toHaveValue("CASS-3 — Recherche documentaire");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("sends the typed query and picks with the mouse", async () => {
    const user = userEvent.setup();
    const { onChange, search } = renderPicker();
    await user.type(screen.getByRole("combobox", { name: "Parent" }), "notif");
    const option = await screen.findByRole("option", { name: /CASS-9/ });
    await waitFor(() => expect(search).toHaveBeenLastCalledWith({ backlogKey: "CASS", q: "notif", types: ["epic"] }));
    await user.click(option);
    expect(onChange).toHaveBeenCalledWith(epics[2]);
  });

  it("says when nothing matches, and when the backlog has nothing of that level", async () => {
    const user = userEvent.setup();
    const onEmptyChange = vi.fn();
    renderPicker({ emptyLabel: "Aucune Epic dans ce backlog.", onEmptyChange, search: searchOf([]) });
    await waitFor(() => expect(onEmptyChange).toHaveBeenCalledWith(true));
    await user.click(screen.getByRole("combobox", { name: "Parent" }));
    // Shown under the field and announced by the status region.
    expect(await screen.findAllByText("Aucune Epic dans ce backlog.")).toHaveLength(2);

    const { onChange } = renderPicker({ "aria-label": "Lier" });
    await user.type(screen.getByRole("combobox", { name: "Lier" }), "zzz");
    expect(await screen.findAllByText("Aucun résultat pour « zzz ».")).toHaveLength(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports an empty level as not empty once something exists", async () => {
    const onEmptyChange = vi.fn();
    renderPicker({ onEmptyChange });
    await waitFor(() => expect(onEmptyChange).toHaveBeenCalledWith(false));
  });

  it("hints at narrowing when a full page comes back", async () => {
    const user = userEvent.setup();
    renderPicker({ search: searchOf(epics, 3) });
    await user.click(screen.getByRole("combobox", { name: "Parent" }));
    expect(await screen.findByText("Affinez la recherche pour voir d’autres items.")).toBeInTheDocument();
  });

  it("shows the search's error", async () => {
    const user = userEvent.setup();
    renderPicker({ search: vi.fn(async () => ({ ok: false as const, error: "Recherche impossible." })) });
    await user.click(screen.getByRole("combobox", { name: "Parent" }));
    expect(await screen.findAllByText("Recherche impossible.")).toHaveLength(2);
  });

  it("closes on Échap without picking, and only then leaves Échap to the form around", async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn();
    const onChange = vi.fn();
    // An inline form closes itself on Échap: the open list takes the key first.
    render(
      <div onKeyDown={onKeyDown}>
        <ItemPicker backlogKey="CASS" value={null} onChange={onChange} aria-label="Parent" search={searchOf()} />
      </div>,
    );
    const input = screen.getByRole("combobox", { name: "Parent" });
    const root = input.closest("[data-slot='item-picker']")!;
    await user.click(input);
    await screen.findAllByRole("option");
    // The dialog and the drawer read this before dismissing on Échap.
    expect(root).toHaveAttribute("data-local-escape");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(root).not.toHaveAttribute("data-local-escape");
    expect(onKeyDown).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it("goes back to the value when the typed text picked nothing", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ value: epics[0]! });
    const input = screen.getByRole("combobox", { name: "Parent" });
    expect(input).toHaveValue("CASS-2 — Connexion");
    await user.click(input);
    await user.keyboard("{Backspace}Reche");
    await screen.findByRole("option", { name: /CASS-3/ });
    await user.tab();
    expect(input).toHaveValue("CASS-2 — Connexion");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears an optional value", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ value: epics[0]!, clearable: true });
    await user.click(screen.getByRole("button", { name: "Effacer" }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.getByRole("combobox", { name: "Parent" })).toHaveFocus();
  });

  it("shows a value set from outside", () => {
    const { rerender } = renderPicker({ value: null });
    rerender(
      <ItemPicker backlogKey="CASS" value={epics[2]!} onChange={vi.fn()} aria-label="Parent" search={searchOf()} />,
    );
    expect(screen.getByRole("combobox", { name: "Parent" })).toHaveValue("CASS-9 — Notifications");
  });

  it("ignores the answer of a request a later one replaced", async () => {
    const user = userEvent.setup();
    type Result = Awaited<ReturnType<ItemPickerSearch>>;
    let resolveFirst: ((result: Result) => void) | undefined;
    const search: ItemPickerSearch = vi.fn(({ q = "" }: { q?: string }): Promise<Result> => {
      if (q === "") {
        return new Promise<Result>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve({ ok: true as const, items: [epics[2]!], limit: 20 });
    });
    renderPicker({ search });
    const input = screen.getByRole("combobox", { name: "Parent" });
    await user.click(input);
    await user.type(input, "notif");
    await screen.findByRole("option", { name: /CASS-9/ });
    resolveFirst!({ ok: true, items: epics, limit: 20 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("offers nothing to pick until the answer to the current text arrives", async () => {
    const user = userEvent.setup();
    type Result = Awaited<ReturnType<ItemPickerSearch>>;
    const pending = new Map<string, (result: Result) => void>();
    const search: ItemPickerSearch = vi.fn(({ q = "" }: { q?: string }) =>
      new Promise<Result>((resolve) => {
        pending.set(q, resolve);
      }),
    );
    const { onChange } = renderPicker({ search, debounceMs: 150 });
    const input = screen.getByRole("combobox", { name: "Parent" });
    await user.click(input);
    // Typed before the first answer, which lands during the pause before the next request.
    await user.type(input, "notif");
    pending.get("")!({ ok: true, items: epics, limit: 20 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(input).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByText("Recherche en cours.").length).toBeGreaterThan(0);
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    // The request for the typed text goes out after the pause and its answer shows.
    await waitFor(() => expect(pending.has("notif")).toBe(true));
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    pending.get("notif")!({ ok: true, items: [epics[2]!], limit: 20 });
    await screen.findByRole("option", { name: /CASS-9/ });
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(epics[2]);
  });

  it("starts again from the first result when the answer changes, and keeps the active one in view", async () => {
    const user = userEvent.setup();
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      const { onChange } = renderPicker();
      const input = screen.getByRole("combobox", { name: "Parent" });
      await user.click(input);
      await screen.findAllByRole("option");
      await user.keyboard("{End}");
      const last = screen.getByRole("option", { name: /CASS-9/ });
      expect(input).toHaveAttribute("aria-activedescendant", last.id);
      expect(scrolled.at(-1)).toBe(last);
      // A narrower answer: the first of it is active, Entrée picks it.
      await user.type(input, "Rech");
      const only = await screen.findByRole("option", { name: /CASS-3/ });
      expect(screen.getAllByRole("option")).toHaveLength(1);
      expect(only).toHaveAttribute("aria-selected", "true");
      await user.keyboard("{Enter}");
      expect(onChange).toHaveBeenCalledWith(epics[1]);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});
