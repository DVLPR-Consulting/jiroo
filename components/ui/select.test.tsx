import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SelectField, type SelectFieldOption } from "@/components/ui/select";

const OPTIONS: SelectFieldOption[] = [
  { value: "", label: "Non assigné" },
  { value: "marie", label: "Marie Lemaire", icon: <span data-testid="marie-icon" /> },
  { value: "paul", label: "Paul Martin" },
];

function Harness({
  initial = "",
  onChange = () => {},
  options = OPTIONS,
  placeholder,
}: {
  initial?: string;
  onChange?: (value: string) => void;
  options?: SelectFieldOption[];
  placeholder?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="assignee">Assigné</label>
      <SelectField
        id="assignee"
        value={value}
        options={options}
        placeholder={placeholder}
        onValueChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    </>
  );
}

describe("SelectField", () => {
  it("is a combobox named by its label and shows the selected option with its icon", () => {
    render(<Harness initial="marie" />);
    const trigger = screen.getByRole("combobox", { name: "Assigné" });
    expect(trigger).toHaveTextContent("Marie Lemaire");
    expect(trigger).toContainElement(screen.getByTestId("marie-icon"));
  });

  it("treats an empty-value option as a real choice, not the placeholder", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial="paul" onChange={onChange} placeholder="Choisir…" />);

    await user.click(screen.getByRole("combobox", { name: "Assigné" }));
    // Icons are decorative: the option is named by its label alone.
    expect(screen.getByRole("option", { name: "Marie Lemaire" })).toBeVisible();
    await user.click(screen.getByRole("option", { name: "Non assigné" }));

    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.getByRole("combobox", { name: "Assigné" })).toHaveTextContent("Non assigné");
  });

  it("shows the placeholder when the value matches no option", () => {
    render(
      <Harness
        initial="ghost"
        placeholder="Choisir un epic…"
        options={[{ value: "epic", label: "DEMO-1 — Paiement" }]}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Assigné" })).toHaveTextContent("Choisir un epic…");
  });

  it("can be driven from the keyboard", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    screen.getByRole("combobox", { name: "Assigné" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("listbox")).toBeVisible();
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("marie");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
