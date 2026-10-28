import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PresencesView, hrefFor } from "@/components/presence/presences-view";
import type { PresencePage } from "@/lib/presence/load";
import type { PresenceTicket } from "@/lib/presence/view";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/presences",
  useSearchParams: () => new URLSearchParams(),
}));
// The shared row's inline editors import Server Actions; the page shows tickets read-only.
vi.mock("@/app/actions/items", () => ({ updateItemAction: vi.fn() }));
const actions = vi.hoisted(() => ({ declareAbsenceAction: vi.fn(), removeAbsenceAction: vi.fn(), carveAbsenceAction: vi.fn() }));
vi.mock("@/app/actions/absences", () => actions);

const ticket = (over: Partial<PresenceTicket> & { id: string; startedAt: string }): PresenceTicket => ({
  key: `DATA-${over.id}`, title: `Ticket ${over.id}`, type: "tache", points: 3, statusCategory: "in_progress",
  assigneeId: "hugo", backlogId: "data", backlogKey: "DATA", doneAt: null, ...over,
});
const sprints = [
  { id: "s8", name: "Sprint 8", state: "active" as const, start: "2026-10-27", end: "2026-11-07" },
  { id: "s9", name: "Sprint 9", state: "planned" as const, start: "2026-11-10", end: "2026-11-21" },
];
// Tuesday 3 November 2026, Camille reading; she administers DATA.
const page: PresencePage = {
  data: {
    today: "2026-11-03",
    viewerId: "camille",
    backlogs: [
      { id: "data", key: "DATA", name: "Données", color: "#7c3030", members: ["camille", "hugo", "ines"] },
      { id: "pen", key: "PEN", name: "Pénal", color: "#2f5d8a", members: ["hugo", "ines"] },
    ],
    people: [
      { id: "hugo", name: "Hugo Lefèvre", profile: "developer" },
      { id: "camille", name: "Camille Morel", profile: "developer" },
      { id: "ines", name: "Inès Garnier", profile: "product" },
    ],
    absences: [
      { id: "a1", userId: "hugo", startDate: "2026-11-03", startHalf: "am", endDate: "2026-11-06", endHalf: "pm" },
      { id: "a2", userId: "hugo", startDate: "2026-11-09", startHalf: "pm", endDate: "2026-11-10", endHalf: "am" },
      // One day declared twice: a morning, then an afternoon.
      { id: "a3", userId: "camille", startDate: "2026-11-17", startHalf: "am", endDate: "2026-11-17", endHalf: "am" },
      { id: "a4", userId: "camille", startDate: "2026-11-17", startHalf: "pm", endDate: "2026-11-17", endHalf: "pm" },
    ],
    tickets: [
      ticket({ id: "1", startedAt: "2026-10-28", doneAt: "2026-11-02", statusCategory: "done" }),
      ticket({ id: "2", startedAt: "2026-10-30" }),
      ticket({ id: "3", startedAt: "2026-11-02", backlogId: "pen", backlogKey: "PEN", key: "PEN-3", historyIncomplete: true }),
      ticket({ id: "4", startedAt: "2026-11-02", assigneeId: "camille" }),
    ],
    sprints: {},
    managedBacklogIds: ["data"],
  },
  scope: "all",
  view: "month",
  anchor: "2026-11-03",
  period: { from: "2026-11-01", to: "2026-11-30" },
  sprint: null,
  sprints: [],
  limited: false,
};
const scoped: PresencePage = { ...page, scope: "data", sprints, data: { ...page.data, sprints: { data: sprints } } };

const half = (label: string) => screen.getByRole("button", { name: label });
const rowOf = (name: string) => screen.getByRole("button", { name }).closest("tr")!;

beforeEach(() => {
  vi.clearAllMocks();
  actions.declareAbsenceAction.mockResolvedValue({ ok: true });
  actions.carveAbsenceAction.mockResolvedValue({ ok: true, absences: [] });
  actions.removeAbsenceAction.mockResolvedValue({ ok: true });
});

describe("PresencesView", () => {
  it("shows the team by profile over the month, with each person's figures and backlogs", () => {
    render(<PresencesView page={page} />);
    expect(screen.getByRole("heading", { level: 1, name: /Absences et congés/ })).toBeInTheDocument();
    expect(screen.getByText("Développement")).toBeInTheDocument();
    expect(screen.getByText("Produit")).toBeInTheDocument();
    // Thirty days, plus the name and the total columns.
    expect(screen.getAllByRole("columnheader")).toHaveLength(32);
    expect(rowOf("Hugo Lefèvre")).toHaveTextContent("5 j absent");
    expect(rowOf("Hugo Lefèvre")).toHaveTextContent("1 terminé · 2 en cours");
    expect(within(rowOf("Hugo Lefèvre")).getAllByText("PEN")).toHaveLength(1);
    expect(rowOf("Inès Garnier")).toHaveTextContent("0 j absent");
    expect(rowOf("Inès Garnier")).not.toHaveTextContent("terminé");
    expect(half("Hugo Lefèvre, 3 nov. matin, absent")).toHaveAttribute("data-state", "away");
    expect(half("Hugo Lefèvre, 4 nov. après-midi, absent")).toHaveAttribute("data-state", "future");
    expect(half("Hugo Lefèvre, 9 nov. matin")).toHaveAttribute("data-state", "free");
    expect(half("Hugo Lefèvre, 11 nov. matin")).toHaveAttribute("data-state", "off");
    expect(screen.getByRole("link", { name: "Sprint" })).toHaveAttribute("aria-disabled", "true");
  });

  it("declares an absence from a drag over free half-days", async () => {
    render(<PresencesView page={page} />);
    fireEvent.mouseDown(half("Camille Morel, 12 nov. matin"), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(half("Camille Morel, 13 nov. après-midi"), { clientX: 60, clientY: 0 });
    fireEvent.mouseUp(window);
    const bar = screen.getByRole("group", { name: "Déclarer une absence" });
    expect(bar).toHaveTextContent("Camille Morel : absent du 12 nov. au 13 nov., 2 j ouvrés");
    await userEvent.click(within(bar).getByRole("button", { name: "Enregistrer" }));
    expect(actions.declareAbsenceAction).toHaveBeenCalledWith({
      userId: "camille", backlogId: "data", startDate: "2026-11-12", startHalf: "am", endDate: "2026-11-13", endHalf: "pm",
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("takes a half-day, a day or the whole absence off from a click on it", async () => {
    render(<PresencesView page={page} />);
    await userEvent.click(half("Hugo Lefèvre, 4 nov. matin, absent"));
    const bar = screen.getByRole("group", { name: "Retirer une absence" });
    expect(bar).toHaveTextContent("Hugo Lefèvre : absent du 3 nov. au 6 nov. (4 j ouvrés)");
    await userEvent.click(within(bar).getByRole("button", { name: "Retirer la journée" }));
    expect(actions.carveAbsenceAction).toHaveBeenCalledWith({
      id: "a1", backlogId: "data", startDate: "2026-11-04", startHalf: "am", endDate: "2026-11-04", endHalf: "pm",
    });
    await userEvent.click(half("Hugo Lefèvre, 5 nov. après-midi, absent"));
    await userEvent.click(screen.getByRole("button", { name: "Retirer toute l’absence" }));
    expect(actions.removeAbsenceAction).toHaveBeenCalledWith({ id: "a1", backlogId: "data" });
    // A day declared twice, morning then afternoon: « Retirer la journée » carves both.
    actions.carveAbsenceAction.mockClear();
    await userEvent.click(half("Camille Morel, 17 nov. matin, absent"));
    expect(screen.getByRole("group", { name: "Retirer une absence" })).toHaveTextContent("Camille Morel : absent le 17 nov. matin");
    await userEvent.click(screen.getByRole("button", { name: "Retirer la journée" }));
    await waitFor(() => expect(actions.carveAbsenceAction).toHaveBeenCalledTimes(2));
    expect(actions.carveAbsenceAction.mock.calls.map(([input]) => input)).toEqual([
      { id: "a3", backlogId: "data", startDate: "2026-11-17", startHalf: "am", endDate: "2026-11-17", endHalf: "am" },
      { id: "a4", backlogId: "data", startDate: "2026-11-17", startHalf: "pm", endDate: "2026-11-17", endHalf: "pm" },
    ]);
  });

  it("declares an absence from the keyboard, through the form", async () => {
    render(<PresencesView page={page} />);
    screen.getByRole("button", { name: "Déclarer une absence" }).focus();
    await userEvent.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Déclarer une absence" });
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Personne" }), "hugo");
    fireEvent.change(within(dialog).getByLabelText("Premier jour"), { target: { value: "2026-11-16" } });
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Début" }), "pm");
    fireEvent.change(within(dialog).getByLabelText("Dernier jour"), { target: { value: "2026-11-18" } });
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Fin" }), "am");
    within(dialog).getByRole("button", { name: "Enregistrer" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(actions.declareAbsenceAction).toHaveBeenCalledWith({
      userId: "hugo", backlogId: "data", startDate: "2026-11-16", startHalf: "pm", endDate: "2026-11-18", endHalf: "am",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.refresh).toHaveBeenCalled();
  });

  it("keeps the click that follows a drag released outside the grid", async () => {
    render(<PresencesView page={page} />);
    fireEvent.mouseDown(half("Camille Morel, 12 nov. matin"), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(half("Camille Morel, 13 nov. après-midi"), { clientX: 60, clientY: 0 });
    fireEvent.mouseUp(window);
    expect(screen.getByRole("group", { name: "Déclarer une absence" })).toBeInTheDocument();
    await userEvent.click(half("Hugo Lefèvre, 4 nov. matin, absent"));
    expect(screen.getByRole("group", { name: "Retirer une absence" })).toBeInTheDocument();
  });

  it("refuses a drag that mixes absent and present half-days, and a drag over nothing working", () => {
    render(<PresencesView page={page} />);
    fireEvent.mouseDown(half("Hugo Lefèvre, 6 nov. matin, absent"), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(half("Hugo Lefèvre, 9 nov. matin"), { clientX: 60, clientY: 0 });
    fireEvent.mouseUp(window);
    expect(screen.getByRole("group", { name: "Sélection" })).toHaveTextContent("mêle des demi-journées absentes et présentes");
    expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
  });

  it("lists a day's tickets as the Liste does, and the period's from the name", async () => {
    render(<PresencesView page={page} />);
    await userEvent.click(half("Hugo Lefèvre, 2 nov. matin").closest("td")!);
    const panel = screen.getByRole("region", { name: "Tickets" });
    expect(panel).toHaveTextContent("Hugo Lefèvre · le 2 nov.");
    expect(panel).toHaveTextContent("3 tickets, 3 pts terminés");
    expect(within(panel).getByText("DATA-1")).toBeInTheDocument();
    expect(within(panel).getByText("PEN-3")).toBeInTheDocument();
    expect(panel).toHaveTextContent("dates approximatives");
    expect(within(panel).getByRole("link", { name: "Voir dans la Liste" })).toHaveAttribute("href", "/b/DATA?view=list&assignee=hugo");
    await userEvent.click(screen.getByRole("button", { name: "Inès Garnier" }));
    expect(screen.getByRole("region", { name: "Tickets" })).toHaveTextContent("Aucun ticket sur cette période.");
    // On the 1st, DATA-1 is under way but its points land on the 2nd: none done yet.
    await userEvent.click(half("Hugo Lefèvre, 1 nov. matin").closest("td")!);
    const sunday = screen.getByRole("region", { name: "Tickets" });
    expect(sunday).toHaveTextContent("2 tickets, 0 pts terminés");
    expect(within(sunday).getByText("DATA-1")).toBeInTheDocument();
  });

  it("shows a backlog's sprints over the days and opens a sprint's tickets", async () => {
    render(<PresencesView page={scoped} />);
    expect(screen.getByRole("link", { name: "Sprint" })).not.toHaveAttribute("aria-disabled");
    const band = screen.getByRole("button", { name: "Sprint 8 · en cours" });
    expect(band.closest("td")).toHaveAttribute("colspan", "7");
    band.focus();
    await userEvent.keyboard("{Enter}");
    const panel = screen.getByRole("region", { name: "Tickets" });
    expect(panel).toHaveTextContent("Sprint 8");
    expect(panel).toHaveTextContent("3 tickets");
    expect(within(panel).getByRole("link", { name: "Voir le rapport de sprint" })).toHaveAttribute("href", "/b/DATA/reports?report=sprint&sprint=s8");
    // Hugo's PEN ticket stays out of the DATA scope.
    expect(within(panel).queryByText("PEN-3")).toBeNull();
  });

  it("reads the year a month at a time, each month leading to its grid", () => {
    render(<PresencesView page={{ ...page, view: "year", period: { from: "2026-01-01", to: "2026-12-31" } }} />);
    const november = screen.getByRole("link", { name: "Hugo Lefèvre, novembre 2026" });
    expect(november).toHaveTextContent("5 j");
    expect(november).toHaveAttribute("href", "/presences?vue=mois&date=2026-11-01");
  });

  it("builds the page's URLs", () => {
    expect(hrefFor(page, { scopeKey: "DATA", view: "sprint" })).toBe("/presences?backlog=DATA&vue=sprint&date=2026-11-03");
    expect(hrefFor(page, { view: "sprint" })).toBe("/presences?vue=mois&date=2026-11-03");
    expect(hrefFor({ ...scoped, view: "sprint", sprint: sprints[0]! }, { sprintId: "s9", anchor: "2026-11-10" })).toBe("/presences?backlog=DATA&vue=sprint&date=2026-11-10&sprint=s9");
  });
});
