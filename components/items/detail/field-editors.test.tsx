import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EstimateField, ReporterField } from "@/components/items/detail/field-editors";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateItemAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/app/actions/items", () => ({
  updateItemAction: mocks.updateItemAction,
}));

vi.mock("@/app/actions/labels", () => ({
  createLabelAction: vi.fn(),
}));

const users = [
  { id: "better-auth-marie", name: "Marie Lemaire", email: "marie@example.test" },
  { id: "better-auth-nora", name: "Nora Benali", email: "nora@example.test" },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("ReporterField", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.updateItemAction.mockReset();
  });

  it("shows the selected reporter immediately and confirms after the action", async () => {
    const user = userEvent.setup();
    const update = deferred<{ ok: true; item: object }>();
    mocks.updateItemAction.mockReturnValueOnce(update.promise);
    render(
      <ReporterField
        itemId="item-1"
        backlogKey="DEMO"
        reporterId="better-auth-marie"
        users={users}
      />,
    );

    const select = screen.getByRole("combobox", { name: "Rapporteur" });
    expect(screen.queryByRole("option", { name: "Non assigné" })).not.toBeInTheDocument();

    await user.selectOptions(select, "better-auth-nora");

    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-1",
      backlogKey: "DEMO",
      reporterId: "better-auth-nora",
    });
    expect(select).toBeDisabled();
    expect(select).toHaveValue("better-auth-nora");
    expect(select).toHaveAttribute("aria-busy", "true");
    expect(mocks.refresh).not.toHaveBeenCalled();

    update.resolve({ ok: true, item: {} });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  });

  it("rolls back the optimistic reporter on failure", async () => {
    const user = userEvent.setup();
    mocks.updateItemAction.mockResolvedValueOnce({
      ok: false,
      error: "Mise à jour impossible.",
    });
    render(
      <ReporterField
        itemId="item-1"
        backlogKey="DEMO"
        reporterId="better-auth-marie"
        users={users}
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Rapporteur" }),
      "better-auth-nora",
    );

    expect(await screen.findByText("Mise à jour impossible.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Rapporteur" })).toHaveValue(
      "better-auth-marie",
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("EstimateField", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.updateItemAction.mockReset();
  });

  it("shows zero and clears it to a null estimate", async () => {
    const user = userEvent.setup();
    mocks.updateItemAction.mockResolvedValueOnce({ ok: true, item: {} });
    render(<EstimateField itemId="item-2" backlogKey="DEMO" estimatePoints={0} />);

    expect(screen.getByRole("spinbutton", { name: "Points" })).toHaveValue(0);
    await user.click(screen.getByRole("button", { name: "Effacer l’estimation" }));

    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-2",
      backlogKey: "DEMO",
      estimatePoints: null,
    });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  });
});
