import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DetailField } from "@/components/items/detail/detail-field";
import { EstimateField, PriorityField } from "@/components/items/detail/field-editors";

const mocks = vi.hoisted(() => ({ updateItemAction: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/actions/items", () => ({ updateItemAction: mocks.updateItemAction }));
vi.mock("@/app/actions/labels", () => ({ createLabelAction: vi.fn() }));

type Result = { ok: true; item: object } | { ok: false; error: string };

/** Each call waits until the test settles it. */
function deferCalls() {
  const settle: ((result: Result) => void)[] = [];
  mocks.updateItemAction.mockImplementation(
    () => new Promise<Result>((resolve) => settle.push(resolve)),
  );
  return settle;
}

function renderRows() {
  return render(
    <div>
      <dl>
        <DetailField
          label="Priorité"
          emptyText="Aucune"
          value={null}
          editor={<PriorityField itemId="item-1" backlogKey="CASS" priority={0} />}
        />
        <DetailField
          label="Points"
          value={null}
          editor={<EstimateField itemId="item-1" backlogKey="CASS" estimatePoints={null} />}
        />
      </dl>
      <button type="button">Ailleurs</button>
    </div>,
  );
}

describe("DetailField keeps the editor's save across read and edit (JIR-73 R1)", () => {
  beforeEach(() => {
    mocks.updateItemAction.mockReset();
    mocks.refresh.mockReset();
  });

  it("still announces a failed priority save after leaving the field", async () => {
    const user = userEvent.setup();
    const settle = deferCalls();
    renderRows();

    await user.click(screen.getByRole("button", { name: /^Priorité / }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Priorité" }), "3");
    await user.click(screen.getByRole("button", { name: "Ailleurs" }));
    // Back in read mode: the editor is hidden, not unmounted.
    expect(screen.queryByRole("combobox", { name: "Priorité" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Priorité", hidden: true })).not.toBeVisible();
    expect(screen.getByText("Enregistrement…")).toBeVisible();

    await act(async () => settle[0]!({ ok: false, error: "REFUS DE PRIORITÉ" }));
    expect(screen.getByRole("alert")).toHaveTextContent("REFUS DE PRIORITÉ");
  });

  it("reopens the same pending priority editor, locked, without a second write", async () => {
    const user = userEvent.setup();
    const settle = deferCalls();
    renderRows();

    await user.click(screen.getByRole("button", { name: /^Priorité / }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Priorité" }), "3");
    await user.click(screen.getByRole("button", { name: "Ailleurs" }));
    await user.click(screen.getByRole("button", { name: /^Priorité / }));

    const select = screen.getByRole("combobox", { name: "Priorité" });
    expect(select).toBeDisabled();
    expect(select).toHaveValue("3");
    expect(mocks.updateItemAction).toHaveBeenCalledTimes(1);
    await act(async () => settle[0]!({ ok: true, item: {} }));
    await waitFor(() => expect(select).toBeEnabled());
  });

  it("keeps a pending estimate locked and its failure visible across leaving", async () => {
    const user = userEvent.setup();
    const settle = deferCalls();
    renderRows();

    await user.click(screen.getByRole("button", { name: /^Points / }));
    await user.type(screen.getByRole("spinbutton", { name: "Points" }), "5");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await user.click(screen.getByRole("button", { name: "Ailleurs" }));
    await user.click(screen.getByRole("button", { name: /^Points / }));

    expect(screen.getByRole("spinbutton", { name: "Points" })).toBeDisabled();
    expect(mocks.updateItemAction).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Ailleurs" }));
    await act(async () => settle[0]!({ ok: false, error: "ESTIMATION REFUSÉE" }));
    expect(screen.getByRole("alert")).toHaveTextContent("ESTIMATION REFUSÉE");
  });
});
