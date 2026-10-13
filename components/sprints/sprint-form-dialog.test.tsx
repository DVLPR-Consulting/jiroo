import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CreateSprintButton,
  EditSprintDialog,
} from "@/components/sprints/sprint-form-dialog";
import { mapSprintZodActionError } from "@/lib/validation/action-error";
import { updateSprintSchema } from "@/lib/validation/sprint";

const mocks = vi.hoisted(() => ({
  createSprintAction: vi.fn(),
  refresh: vi.fn(),
  updateSprintAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/actions/sprints", () => ({
  createSprintAction: mocks.createSprintAction,
  updateSprintAction: mocks.updateSprintAction,
}));

const sprint = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Sprint paiement",
  goal: "Livrer le paiement invité",
  state: "planned" as const,
  plannedStartAt: "2026-08-10T09:00:00.000Z",
  plannedEndAt: "2026-08-24T09:00:00.000Z",
  capacityPoints: 20,
};

// Dates are entered in the browser's time zone, Europe/Paris for the team.
const previousTimeZone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Europe/Paris";
});
afterAll(() => {
  if (previousTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = previousTimeZone;
});

const undated = { ...sprint, plannedStartAt: null, plannedEndAt: null };

function setField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** Records the field's error state at the moment it receives focus. */
function captureOnFocus(element: HTMLElement) {
  const seen: Array<{ invalid: string | null; description: string }> = [];
  element.addEventListener("focus", () => {
    const ids = element.getAttribute("aria-describedby")?.split(" ") ?? [];
    seen.push({
      invalid: element.getAttribute("aria-invalid"),
      description: ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" "),
    });
  });
  return seen;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("sprint form dialogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers a discoverable sprint creation and refreshes only after success", async () => {
    const user = userEvent.setup();
    mocks.createSprintAction.mockResolvedValueOnce({
      ok: true,
      sprint: { id: sprint.id, name: "Sprint 1" },
    });
    render(
      <CreateSprintButton
        backlogId="11111111-1111-4111-8111-111111111111"
        backlogKey="DEMO"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Créer un sprint" }));

    expect(mocks.createSprintAction).toHaveBeenCalledWith({
      backlogId: "11111111-1111-4111-8111-111111111111",
      backlogKey: "DEMO",
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("retains edited values and exposes field errors after a server failure", async () => {
    const user = userEvent.setup();
    mocks.updateSprintAction.mockResolvedValueOnce({
      ok: false,
      error: "Le nom du sprint est requis.",
      fieldErrors: { name: ["Le nom du sprint est requis."] },
    });
    render(
      <EditSprintDialog
        backlogId="11111111-1111-4111-8111-111111111111"
        backlogKey="DEMO"
        sprint={sprint}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier Sprint paiement" }));
    const name = screen.getByRole("textbox", { name: "Nom" });
    await user.clear(name);
    await user.type(name, "Nom conservé");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le nom du sprint est requis.",
    );
    expect(name).toHaveValue("Nom conservé");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("cannot be closed while an edit is pending, so its response stays in that opening", async () => {
    const user = userEvent.setup();
    const request = deferred<{ ok: false; error: string }>();
    mocks.updateSprintAction.mockReturnValueOnce(request.promise);
    render(
      <EditSprintDialog
        backlogId="11111111-1111-4111-8111-111111111111"
        backlogKey="DEMO"
        sprint={sprint}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Modifier Sprint paiement" }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(screen.getByRole("button", { name: "Enregistrement…" })).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog")).toBeVisible();

    request.resolve({ ok: false, error: "Ce sprint a changé." });
    expect(await screen.findByRole("alert")).toHaveTextContent("Ce sprint a changé.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Enregistrer" })).toBeEnabled());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Modifier Sprint paiement" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("submits planning values as ISO dates and closes after success", async () => {
    const user = userEvent.setup();
    mocks.updateSprintAction.mockResolvedValueOnce({ ok: true, sprint });
    render(
      <EditSprintDialog
        backlogId="11111111-1111-4111-8111-111111111111"
        backlogKey="DEMO"
        sprint={sprint}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Modifier Sprint paiement" }));
    await user.clear(screen.getByRole("spinbutton", { name: "Capacité (points)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Capacité (points)" }), "21.5");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(mocks.updateSprintAction).toHaveBeenCalledOnce());
    expect(mocks.updateSprintAction).toHaveBeenCalledWith(
      expect.objectContaining({
        backlogKey: "DEMO",
        id: sprint.id,
        capacityPoints: 21.5,
        plannedStartAt: expect.stringMatching(/^2026-08-10T/),
        plannedEndAt: expect.stringMatching(/^2026-08-24T/),
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("saves a two-decimal capacity rejected by float rounding before JIR-90", async () => {
    const user = userEvent.setup();
    mocks.updateSprintAction.mockResolvedValueOnce({ ok: true, sprint });
    render(
      <EditSprintDialog
        backlogId="11111111-1111-4111-8111-111111111111"
        backlogKey="DEMO"
        sprint={sprint}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Modifier Sprint paiement" }));
    const capacity = screen.getByRole("spinbutton", { name: "Capacité (points)" });
    await user.clear(capacity);
    await user.type(capacity, "0.29");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(mocks.updateSprintAction).toHaveBeenCalledOnce());
    expect(mocks.updateSprintAction).toHaveBeenCalledWith(
      expect.objectContaining({ capacityPoints: 0.29 }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens with the sprint's current values after its props change", async () => {
    const user = userEvent.setup();
    const props = {
      backlogId: "11111111-1111-4111-8111-111111111111",
      backlogKey: "DEMO",
    };
    const { rerender } = render(<EditSprintDialog {...props} sprint={sprint} />);
    rerender(
      <EditSprintDialog
        {...props}
        sprint={{
          ...sprint,
          name: "Recette 1",
          goal: "Sprint de test 1 semaine",
          capacityPoints: 15,
          plannedStartAt: new Date(2026, 8, 1, 9, 30),
          plannedEndAt: new Date(2026, 8, 8, 17, 0),
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier Recette 1" }));
    expect(screen.getByRole("textbox", { name: "Nom" })).toHaveValue("Recette 1");
    expect(screen.getByRole("textbox", { name: "Objectif" }))
      .toHaveValue("Sprint de test 1 semaine");
    expect(screen.getByLabelText("Début prévu")).toHaveValue("2026-09-01");
    expect(screen.getByLabelText("Heure de début")).toHaveValue("09:30");
    expect(screen.getByLabelText("Fin prévue")).toHaveValue("2026-09-08");
    expect(screen.getByLabelText("Heure de fin")).toHaveValue("17:00");
    expect(screen.getByRole("spinbutton", { name: "Capacité (points)" })).toHaveValue(15);
  });

  it("saves dates entered without a time at 09:00 and 18:00 Paris time (JIR-87)", async () => {
    const user = userEvent.setup();
    mocks.updateSprintAction.mockResolvedValueOnce({ ok: true, sprint });
    render(
      <EditSprintDialog
        backlogId="11111111-1111-4111-8111-111111111111"
        backlogKey="DEMO"
        sprint={undated}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Modifier Sprint paiement" }));
    expect(screen.getByRole("dialog").querySelector("form")).toHaveAttribute("novalidate");
    expect(screen.getByLabelText("Heure de début")).toHaveValue("");
    // Across the end of summer time (25 October 2026, 03:00).
    setField("Début prévu", "2026-10-24");
    setField("Fin prévue", "2026-10-25");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(mocks.updateSprintAction).toHaveBeenCalledOnce());
    expect(mocks.updateSprintAction).toHaveBeenCalledWith(
      expect.objectContaining({
        plannedStartAt: "2026-10-24T07:00:00.000Z",
        plannedEndAt: "2026-10-25T17:00:00.000Z",
      }),
    );
  });

  it("keeps an explicit time and clears a removed date", async () => {
    const user = userEvent.setup();
    mocks.updateSprintAction.mockResolvedValueOnce({ ok: true, sprint });
    render(
      <EditSprintDialog
        backlogId="11111111-1111-4111-8111-111111111111"
        backlogKey="DEMO"
        sprint={sprint}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Modifier Sprint paiement" }));
    setField("Heure de début", "14:30");
    setField("Fin prévue", "");
    setField("Heure de fin", "");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(mocks.updateSprintAction).toHaveBeenCalledOnce());
    expect(mocks.updateSprintAction).toHaveBeenCalledWith(
      expect.objectContaining({
        plannedStartAt: "2026-08-10T12:30:00.000Z",
        plannedEndAt: null,
      }),
    );
  });

  it("explains an end before the start under the field without calling the server", async () => {
    const user = userEvent.setup();
    render(
      <EditSprintDialog
        backlogId="11111111-1111-4111-8111-111111111111"
        backlogKey="DEMO"
        sprint={undated}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Modifier Sprint paiement" }));
    setField("Début prévu", "2026-10-15");
    setField("Fin prévue", "2026-10-14");
    const focused = captureOnFocus(screen.getByLabelText("Fin prévue"));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    const end = screen.getByLabelText("Fin prévue");
    expect(end).toHaveAttribute("aria-invalid", "true");
    expect(end).toHaveAccessibleDescription(
      expect.stringContaining("La date de fin doit être postérieure à la date de début."),
    );
    expect(screen.getByLabelText("Début prévu")).not.toHaveAttribute("aria-invalid");
    // Focus moves to the field, which reads its label and error once.
    expect(end).toHaveFocus();
    // The error is already rendered when focus lands on the field.
    expect(focused).toEqual([
      { invalid: "true", description: expect.stringContaining("La date de fin doit être postérieure à la date de début.") },
    ]);
    expect(mocks.updateSprintAction).not.toHaveBeenCalled();

    setField("Fin prévue", "2026-10-29");
    expect(end).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("La date de fin doit être postérieure à la date de début.")).not.toBeInTheDocument();
  });

  it("asks for the date when only a time is entered", async () => {
    const user = userEvent.setup();
    render(
      <EditSprintDialog
        backlogId="11111111-1111-4111-8111-111111111111"
        backlogKey="DEMO"
        sprint={undated}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Modifier Sprint paiement" }));
    setField("Heure de début", "10:00");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(screen.getByLabelText("Début prévu")).toHaveAccessibleDescription(
      expect.stringContaining("Indiquez la date correspondant à cette heure."),
    );
    expect(mocks.updateSprintAction).not.toHaveBeenCalled();
  });

  it.each([
    ["1000", "La capacité ne peut pas dépasser 999,99 points."],
    ["-1", "La capacité doit être positive."],
    ["1.234", "La capacité accepte au maximum deux décimales."],
  ])("explains an invalid capacity %s under the field before calling the server", async (value, message) => {
    const user = userEvent.setup();
    render(
      <EditSprintDialog
        backlogId="11111111-1111-4111-8111-111111111111"
        backlogKey="DEMO"
        sprint={sprint}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Modifier Sprint paiement" }));
    setField("Capacité (points)", value);
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    const capacity = screen.getByRole("spinbutton", { name: "Capacité (points)" });
    expect(capacity).toHaveAttribute("aria-invalid", "true");
    expect(capacity).toHaveAccessibleDescription(message);
    expect(capacity).toHaveFocus();
    expect(mocks.updateSprintAction).not.toHaveBeenCalled();
  });

  it("shows the server's real validation errors under the date and capacity fields", async () => {
    const user = userEvent.setup();
    // The server rejects what the dialog sent once tampered: the real schema
    // and the real action mapper produce the response.
    mocks.updateSprintAction.mockImplementationOnce(async (input) => {
      const parsed = updateSprintSchema.safeParse({
        ...input,
        plannedEndAt: "2026-08-01T09:00:00.000Z",
        capacityPoints: 1000,
      });
      if (parsed.success) throw new Error("Expected validation failure");
      return { ok: false, ...mapSprintZodActionError(parsed.error) };
    });
    render(
      <EditSprintDialog
        backlogId="11111111-1111-4111-8111-111111111111"
        backlogKey="DEMO"
        sprint={sprint}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Modifier Sprint paiement" }));
    const focused = captureOnFocus(screen.getByLabelText("Fin prévue"));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    const end = screen.getByLabelText("Fin prévue");
    await waitFor(() => expect(end).toHaveFocus());
    expect(focused).toEqual([
      { invalid: "true", description: expect.stringContaining("La date de fin doit être postérieure à la date de début.") },
    ]);
    expect(end).toHaveAttribute("aria-invalid", "true");
    expect(end).toHaveAccessibleDescription(
      expect.stringContaining("La date de fin doit être postérieure à la date de début."),
    );
    expect(end).toHaveFocus();
    const capacity = screen.getByRole("spinbutton", { name: "Capacité (points)" });
    expect(capacity).toHaveAttribute("aria-invalid", "true");
    expect(capacity).toHaveAccessibleDescription("La capacité ne peut pas dépasser 999,99 points.");
  });

  it("limits a completed sprint edit to its name and goal", async () => {
    const user = userEvent.setup();
    render(
      <EditSprintDialog
        backlogId="11111111-1111-4111-8111-111111111111"
        backlogKey="DEMO"
        sprint={{ ...sprint, state: "completed" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Modifier Sprint paiement" }));

    expect(screen.getByRole("textbox", { name: "Nom" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Objectif" })).toBeVisible();
    expect(screen.queryByRole("spinbutton", { name: "Capacité (points)" }))
      .not.toBeInTheDocument();
    expect(screen.queryByLabelText("Début prévu")).not.toBeInTheDocument();
    expect(screen.getByText(/sprint terminé/i)).toBeVisible();
  });

  it("reports a rejected edit request, re-enables saving and stays closable", async () => {
    const user = userEvent.setup();
    // Drop any unconsumed one-shot result left by an earlier test.
    mocks.updateSprintAction.mockReset().mockRejectedValueOnce(new Error("network"));
    render(
      <EditSprintDialog
        backlogId="11111111-1111-4111-8111-111111111111"
        backlogKey="DEMO"
        sprint={sprint}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Modifier Sprint paiement" }));
    await user.clear(screen.getByRole("textbox", { name: "Nom" }));
    await user.type(screen.getByRole("textbox", { name: "Nom" }), "Sprint conservé");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Mise à jour du sprint impossible.",
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Enregistrer" })).toBeEnabled());
    expect(screen.getByRole("textbox", { name: "Nom" })).toHaveValue("Sprint conservé");
    expect(mocks.refresh).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("reports a rejected creation request and re-enables the button", async () => {
    const user = userEvent.setup();
    // Drop any unconsumed one-shot result left by an earlier test.
    mocks.createSprintAction.mockReset().mockRejectedValueOnce(new Error("network"));
    render(<CreateSprintButton backlogId="11111111-1111-4111-8111-111111111111" backlogKey="DEMO" />);
    await user.click(screen.getByRole("button", { name: "Créer un sprint" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Création du sprint impossible.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Créer un sprint" })).toBeEnabled());
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
