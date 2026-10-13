import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BacklogStartGuide,
  InlineStartStep,
  StartStepButton,
  ViewStartGuide,
  canCreateStartStep,
} from "@/components/items/backlog-start-guide";

const mocks = vi.hoisted(() => ({
  createItemAction: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/app/actions/items", () => ({
  createItemAction: mocks.createItemAction,
}));

const statuses = [{ id: "todo-id", name: "À faire" }];
const composant = { id: "comp-1", key: "DEMO-1", type: "composant" as const, title: "Portail" };
const otherComposant = { id: "comp-2", key: "DEMO-2", type: "composant" as const, title: "Greffe" };

const COMPOSANT_TITLE = "Commencez par créer un Composant (un domaine ou un produit)";
const EPIC_TITLE = "Créez une Epic dans un Composant";

describe("canCreateStartStep", () => {
  const dialog = { items: [], statuses };

  it("needs the create right for a Composant", () => {
    expect(canCreateStartStep("composant", true, { ...dialog, canScheduleItems: false })).toBe(true);
    expect(canCreateStartStep("composant", false, dialog)).toBe(false);
  });

  it("needs the scheduling right too for an Epic, which has a parent", () => {
    expect(canCreateStartStep("epic", true, dialog)).toBe(true);
    expect(canCreateStartStep("epic", true, { ...dialog, canScheduleItems: false })).toBe(false);
    expect(canCreateStartStep("epic", false, dialog)).toBe(false);
  });

  it("offers nothing without the view's dialog data", () => {
    expect(canCreateStartStep("composant", true, undefined)).toBe(false);
  });
});

describe("StartStepButton", () => {
  beforeEach(() => {
    mocks.createItemAction.mockReset();
    mocks.refresh.mockReset();
  });

  it("opens « Nouvel item » preset to a Composant and creates it", async () => {
    const user = userEvent.setup();
    mocks.createItemAction.mockResolvedValueOnce({ ok: true, item: { id: "new", key: "DEMO-1" } });
    render(
      <StartStepButton
        step="composant"
        backlogId="backlog-id"
        backlogKey="DEMO"
        dialogProps={{ items: [], statuses }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouveau Composant" }));
    const dialog = screen.getByRole("dialog", { name: /Nouvel item/ });
    expect(within(dialog).getByRole("combobox", { name: "Type" })).toHaveTextContent("Composant");
    expect(within(dialog).queryByRole("combobox", { name: /Parent/ })).not.toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: /Titre/ }), "Portail");
    await user.click(within(dialog).getByRole("button", { name: "Créer" }));

    await waitFor(() =>
      expect(mocks.createItemAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: "composant", parentId: null, title: "Portail" }),
      ),
    );
  });

  it("presets an Epic under the only Composant", async () => {
    const user = userEvent.setup();
    render(
      <StartStepButton
        step="epic"
        backlogId="backlog-id"
        backlogKey="DEMO"
        dialogProps={{ items: [composant], statuses }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouvelle Epic" }));
    const dialog = screen.getByRole("dialog", { name: /Nouvel item/ });
    expect(within(dialog).getByRole("combobox", { name: "Type" })).toHaveTextContent("Epic");
    expect(within(dialog).getByRole("combobox", { name: /Parent/ })).toHaveTextContent(
      "DEMO-1 — Portail",
    );
  });

  it("moves on to an Epic once the Composant is created", async () => {
    const user = userEvent.setup();
    mocks.createItemAction.mockResolvedValueOnce({ ok: true, item: { id: "comp-1", key: "DEMO-1" } });
    const { rerender } = render(
      <StartStepButton
        step="composant"
        backlogId="backlog-id"
        backlogKey="DEMO"
        dialogProps={{ items: [], statuses }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Nouveau Composant" }));
    await user.type(screen.getByRole("textbox", { name: /Titre/ }), "Portail");
    await user.click(screen.getByRole("button", { name: "Créer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // The refreshed view hands the next step to the same button slot.
    rerender(
      <StartStepButton
        step="epic"
        backlogId="backlog-id"
        backlogKey="DEMO"
        dialogProps={{ items: [composant], statuses }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Nouvelle Epic" }));
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent("Epic");
  });

  it("lets the parent be chosen among several Composants", async () => {
    const user = userEvent.setup();
    render(
      <StartStepButton
        step="epic"
        backlogId="backlog-id"
        backlogKey="DEMO"
        dialogProps={{ items: [composant, otherComposant], statuses }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouvelle Epic" }));
    const parent = within(screen.getByRole("dialog")).getByRole("combobox", { name: /Parent/ });
    expect(parent).toHaveTextContent("Choisir un composant…");
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Créer" })).toBeDisabled();
  });
});

describe("BacklogStartGuide", () => {
  it("explains each step with its call to action", () => {
    const { rerender } = render(
      <BacklogStartGuide step="composant" canCreate variant="empty" action={<button type="button">Go</button>} />,
    );
    expect(screen.getByRole("heading", { name: COMPOSANT_TITLE })).toBeVisible();
    expect(screen.getByRole("button", { name: "Go" })).toBeVisible();

    rerender(
      <BacklogStartGuide step="epic" canCreate variant="callout" action={<button type="button">Go</button>} />,
    );
    const note = screen.getByRole("note", { name: EPIC_TITLE });
    expect(note).toHaveTextContent("Une Tâche se rattache toujours à une Epic");
    expect(within(note).getByRole("button", { name: "Go" })).toBeVisible();
  });

  it("only states what is missing to users who may not create it", () => {
    const { rerender } = render(
      <BacklogStartGuide step="composant" canCreate={false} variant="empty" action={<button type="button">Go</button>} />,
    );
    expect(screen.getByRole("heading", { name: "Ce backlog est vide" })).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(
      <BacklogStartGuide step="epic" canCreate={false} variant="callout" action={<button type="button">Go</button>} />,
    );
    expect(screen.getByRole("note", { name: "Aucune Epic pour l’instant" })).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("ViewStartGuide", () => {
  it("hides the Epic button from a creator without the scheduling right", () => {
    render(
      <ViewStartGuide
        step="epic"
        backlogKey="DEMO"
        dialogProps={{ backlogId: "backlog-id", items: [composant], statuses, canScheduleItems: false }}
        canCreateItems
        variant="callout"
      />,
    );

    expect(screen.getByRole("note", { name: "Aucune Epic pour l’instant" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Nouvelle Epic" })).not.toBeInTheDocument();
  });
});

describe("InlineStartStep", () => {
  it("names the section of its button for screen readers", () => {
    render(
      <InlineStartStep
        step="epic"
        backlogId="backlog-id"
        backlogKey="DEMO"
        dialogProps={{ items: [composant], statuses }}
        contextLabel="Sprint 1"
      />,
    );

    expect(screen.getByText("Pour créer un item, créez d’abord une Epic.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Nouvelle Epic (Sprint 1)" })).toBeVisible();
  });
});
