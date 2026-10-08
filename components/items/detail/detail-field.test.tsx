import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DetailField } from "@/components/items/detail/detail-field";
import {
  KeyboardShortcutsProvider,
} from "@/components/shortcuts/keyboard-shortcuts-provider";

function renderField(props: Partial<Parameters<typeof DetailField>[0]> = {}) {
  return render(
    <KeyboardShortcutsProvider>
      <div role="dialog" data-shortcut-scope="item">
        <dl>
          <DetailField
            label="Priorité"
            value="Haute"
            editor={
              <select aria-label="Priorité" defaultValue="3">
                <option value="0">Aucune</option>
                <option value="3">Haute</option>
              </select>
            }
            {...props}
          />
        </dl>
        <button type="button">Ailleurs</button>
      </div>
    </KeyboardShortcutsProvider>,
  );
}

describe("DetailField", () => {
  it("reads « label : value » and opens the existing editor on click", async () => {
    const user = userEvent.setup();
    renderField();
    expect(screen.queryByRole("combobox", { name: "Priorité" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Priorité Haute" }));
    expect(screen.getByRole("combobox", { name: "Priorité" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Ailleurs" }));
    expect(screen.queryByRole("combobox", { name: "Priorité" })).not.toBeInTheDocument();
  });

  it("closes the editor with Escape and returns focus to the value", async () => {
    const user = userEvent.setup();
    renderField();
    await user.click(screen.getByRole("button", { name: "Priorité Haute" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("combobox", { name: "Priorité" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Priorité Haute" })).toHaveFocus();
  });

  it("closes when the user presses outside, even if the editor lost focus without a blur", async () => {
    const user = userEvent.setup();
    renderField();
    await user.click(screen.getByRole("button", { name: "Priorité Haute" }));
    // A select disabled while saving drops focus silently: no blur reaches the row.
    fireEvent.pointerDown(screen.getByRole("button", { name: "Ailleurs" }));
    expect(screen.queryByRole("combobox", { name: "Priorité" })).not.toBeInTheDocument();
  });

  it("greys an empty value as « Aucun(e) »", () => {
    renderField({ value: null, emptyText: "Aucune" });
    expect(screen.getByText("Aucune")).toHaveClass("text-muted-foreground");
  });

  it("is plain text without an editor", () => {
    renderField({ editor: undefined });
    expect(screen.queryByRole("button", { name: /Priorité/ })).not.toBeInTheDocument();
    expect(screen.getByText("Haute")).toBeVisible();
  });

  it("opens from its shortcut inside the item drawer", async () => {
    const user = userEvent.setup();
    const showPicker = vi.fn();
    HTMLSelectElement.prototype.showPicker = showPicker;
    renderField({ shortcut: "item.assign" });
    screen.getByRole("button", { name: "Ailleurs" }).focus();
    await user.keyboard("a");
    expect(screen.getByRole("combobox", { name: "Priorité" })).toHaveFocus();
    expect(showPicker).toHaveBeenCalled();
  });
});
