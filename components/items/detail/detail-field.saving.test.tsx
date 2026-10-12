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

describe("Points follow the server value while not edited (JIR-73 R4)", () => {
  beforeEach(() => {
    mocks.updateItemAction.mockReset();
    mocks.updateItemAction.mockResolvedValue({ ok: true, item: {} });
  });

  function points(estimatePoints: number | null) {
    return (
      <div>
        <dl>
          <DetailField
            label="Points"
            value={estimatePoints === null ? null : `${estimatePoints} pts`}
            editor={<EstimateField itemId="item-1" backlogKey="CASS" estimatePoints={estimatePoints} />}
          />
        </dl>
        <button type="button">Ailleurs</button>
      </div>
    );
  }

  it.each([
    [5, "5"],
    [null, ""],
  ] as const)("opens on the refreshed value (%s → 8) and saves that value", async (initial, shown) => {
    const user = userEvent.setup();
    const { rerender } = render(points(initial));
    expect(screen.getByRole("spinbutton", { name: "Points", hidden: true })).toHaveValue(
      shown === "" ? null : Number(shown),
    );

    rerender(points(8));
    await user.click(screen.getByRole("button", { name: /^Points / }));
    expect(screen.getByRole("spinbutton", { name: "Points" })).toHaveValue(8);
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(mocks.updateItemAction).toHaveBeenCalledWith(
      expect.objectContaining({ estimatePoints: 8 }),
    );
  });

  it("keeps what the user is typing when the server value changes meanwhile", async () => {
    const user = userEvent.setup();
    const { rerender } = render(points(5));
    await user.click(screen.getByRole("button", { name: /^Points / }));
    const input = screen.getByRole("spinbutton", { name: "Points" });
    await user.clear(input);
    await user.type(input, "13");

    rerender(points(8));
    expect(screen.getByRole("spinbutton", { name: "Points" })).toHaveValue(13);
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(mocks.updateItemAction).toHaveBeenCalledWith(
      expect.objectContaining({ estimatePoints: 13 }),
    );
  });
});

describe("a server value received while saving is not lost (JIR-73 R4, round 3)", () => {
  beforeEach(() => {
    mocks.updateItemAction.mockReset();
    mocks.refresh.mockReset();
  });

  function points(estimatePoints: number | null) {
    return (
      <div>
        <dl>
          <DetailField
            label="Points"
            value={estimatePoints === null ? null : `${estimatePoints} pts`}
            editor={<EstimateField itemId="item-1" backlogKey="CASS" estimatePoints={estimatePoints} />}
          />
        </dl>
        <button type="button">Ailleurs</button>
      </div>
    );
  }

  async function saveThirteenThenRefreshToEight() {
    const user = userEvent.setup();
    const settle = deferCalls();
    const view = render(points(5));
    await user.click(screen.getByRole("button", { name: /^Points / }));
    const input = screen.getByRole("spinbutton", { name: "Points" });
    await user.clear(input);
    await user.type(input, "13");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await user.click(screen.getByRole("button", { name: "Ailleurs" }));
    // A concurrent change reaches the drawer while 13 is still saving.
    view.rerender(points(8));
    expect(screen.getByRole("spinbutton", { name: "Points", hidden: true })).toBeDisabled();
    return { user, settle };
  }

  it("falls back to the latest server value after a failed save, and saves from it", async () => {
    const { user, settle } = await saveThirteenThenRefreshToEight();
    await act(async () => settle[0]!({ ok: false, error: "ESTIMATION REFUSÉE" }));

    expect(screen.getByRole("alert")).toHaveTextContent("ESTIMATION REFUSÉE");
    expect(screen.getByRole("button", { name: /^Points / })).toHaveTextContent("8 pts");
    await user.click(screen.getByRole("button", { name: /^Points / }));
    expect(screen.getByRole("spinbutton", { name: "Points" })).toHaveValue(8);

    mocks.updateItemAction.mockResolvedValue({ ok: true, item: {} });
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(mocks.updateItemAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ estimatePoints: 8 }),
    );
  });

  it("keeps the saved value after success, not the older value received meanwhile", async () => {
    const { user, settle } = await saveThirteenThenRefreshToEight();
    await act(async () => settle[0]!({ ok: true, item: {} }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Points / }));
    expect(screen.getByRole("spinbutton", { name: "Points" })).toHaveValue(13);
    expect(mocks.refresh).toHaveBeenCalled();
  });
});

