import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DueDateField, EstimateField, ReporterField, StartDateField } from "@/components/items/detail/field-editors";

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


describe("StartDateField", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.updateItemAction.mockReset();
  });

  it.each([null, "2026-10-01"])("shows the start date %s", (startDate) => {
    render(<StartDateField itemId="item-1" backlogKey="DEMO" startDate={startDate} />);
    expect(screen.getByLabelText("Début")).toHaveValue(startDate ?? "");
  });

  it("updates the start date optimistically and waits for confirmation", async () => {
    const update = deferred<{ ok: true; item: object }>();
    mocks.updateItemAction.mockReturnValueOnce(update.promise);
    render(<StartDateField itemId="item-1" backlogKey="DEMO" startDate={null} />);
    const input = screen.getByLabelText("Début");

    fireEvent.change(input, { target: { value: "2026-10-01" } });

    expect(input).toHaveValue("2026-10-01");
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("aria-busy", "true");
    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-1", backlogKey: "DEMO", startDate: "2026-10-01",
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
    await act(async () => update.resolve({ ok: true, item: {} }));
    expect(input).not.toBeDisabled();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("clears the start date to null", async () => {
    mocks.updateItemAction.mockResolvedValueOnce({ ok: true, item: {} });
    render(<StartDateField itemId="item-1" backlogKey="DEMO" startDate="2026-10-01" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Effacer" }));
    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-1", backlogKey: "DEMO", startDate: null,
    });
    expect(screen.getByLabelText("Début")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Effacer" })).not.toBeInTheDocument();
  });

  it("shows the ordering error and restores the previous date", async () => {
    const update = deferred<{ ok: false; error: string }>();
    mocks.updateItemAction.mockReturnValueOnce(update.promise);
    render(<StartDateField itemId="item-1" backlogKey="DEMO" startDate="2026-10-01" />);
    const input = screen.getByLabelText("Début");
    fireEvent.change(input, { target: { value: "2026-11-01" } });
    expect(input).toHaveValue("2026-11-01");
    await act(async () => update.resolve({ ok: false, error: "Le début doit précéder l’échéance." }));
    expect(screen.getByText("Le début doit précéder l’échéance.")).toBeVisible();
    expect(input).toHaveValue("2026-10-01");
    expect(input).not.toBeDisabled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("calendar date inputs", () => {
  beforeEach(() => {
    vi.stubEnv("TZ", "America/Los_Angeles");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["2026-10-20", new Date("2026-10-20T00:00:00.000Z")])(
    "keeps the UTC calendar day for %s",
    (dueDate) => {
      render(<DueDateField itemId="item-1" backlogKey="DEMO" dueDate={dueDate} />);
      expect(screen.getByLabelText("Échéance")).toHaveValue("2026-10-20");
    },
  );
});
