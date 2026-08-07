import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FixVersionPicker } from "@/components/items/fix-version-picker";

const active = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "2026.10",
  released: false,
  archived: false,
};
const published = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "2026.09",
  released: true,
  archived: false,
};
const archived = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Legacy",
  released: true,
  archived: true,
};

describe("FixVersionPicker", () => {
  it("offers active and published candidates while excluding an unselected archive", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FixVersionPicker
        value={[]}
        options={[active, published, archived]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Versions" }));

    expect(screen.getByRole("menuitemcheckbox", { name: "2026.10" })).toBeVisible();
    const publishedOption = screen.getByRole("menuitemcheckbox", {
      name: "2026.09 — Publiée",
    });
    expect(publishedOption).toBeVisible();
    expect(screen.queryByRole("menuitemcheckbox", { name: /Legacy/ })).not.toBeInTheDocument();
    await user.click(publishedOption);
    expect(onChange).toHaveBeenCalledWith([published.id]);
  });

  it("shows a current archived value, allows removal, and prevents re-add", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <FixVersionPicker
        value={[archived.id]}
        options={[active, archived]}
        onChange={onChange}
      />,
    );

    expect(screen.getByText("Legacy — Archivée")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retirer Legacy" }));
    expect(onChange).toHaveBeenCalledWith([]);

    rerender(
      <FixVersionPicker value={[]} options={[active, archived]} onChange={onChange} />,
    );
    await user.click(screen.getByRole("button", { name: "Versions" }));
    expect(screen.queryByRole("menuitemcheckbox", { name: /Legacy/ })).not.toBeInTheDocument();
  });

  it("supports keyboard selection through the checkbox menu", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FixVersionPicker value={[]} options={[active]} onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: "Versions" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const option = screen.getByRole("menuitemcheckbox", { name: active.name });
    expect(option).toHaveFocus();
    await user.keyboard(" ");

    expect(onChange).toHaveBeenCalledWith([active.id]);
  });

  it("shows two chips and an accessible +N overflow that can remove a hidden archive", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fourth = {
      id: "44444444-4444-4444-8444-444444444444",
      name: "2026.08",
      released: false,
      archived: false,
    };
    render(
      <FixVersionPicker
        value={[active.id, published.id, archived.id, fourth.id]}
        options={[active, published, archived, fourth]}
        onChange={onChange}
      />,
    );

    const selected = screen.getByRole("list", { name: "Versions sélectionnées" });
    expect(within(selected).getByText("2026.10")).toBeVisible();
    expect(within(selected).getByText("2026.09 — Publiée")).toBeVisible();
    expect(within(selected).getByText("+2")).toBeVisible();
    expect(within(selected).queryByText("Legacy — Archivée")).not.toBeInTheDocument();

    await user.click(within(selected).getByRole("button", {
      name: "Afficher 2 versions supplémentaires",
    }));
    expect(within(selected).getByText("Legacy — Archivée")).toBeVisible();
    await user.click(within(selected).getByRole("button", { name: "Retirer Legacy" }));
    expect(onChange).toHaveBeenCalledWith([active.id, published.id, fourth.id]);
  });

  it("disables selection and removal while a consumer mutation is pending", () => {
    render(
      <FixVersionPicker
        value={[active.id]}
        options={[active]}
        disabled
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Versions" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retirer 2026.10" })).toBeDisabled();
  });
});
