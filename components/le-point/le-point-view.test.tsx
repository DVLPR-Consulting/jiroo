import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LePointView, PERSPECTIVE_STORAGE_KEY, SCOPE_STORAGE_KEY, ticketHref } from "@/components/le-point/le-point-view";
import { ShellDataProvider } from "@/components/shell/shell-data";
import { LE_POINT_DEMO } from "@/lib/le-point/fixtures";
import { developerView, productView } from "@/lib/le-point/model";
import { VISIT_COOKIE } from "@/lib/le-point/visit";

vi.mock("next/navigation", () => ({
  usePathname: () => "/b/DEMO/le-point",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
// The shared row's inline editors import Server Actions; Le point shows them read-only.
vi.mock("@/app/actions/items", () => ({ updateItemAction: vi.fn() }));
const absenceActions = vi.hoisted(() => ({ declareAbsenceAction: vi.fn(), removeAbsenceAction: vi.fn() }));
vi.mock("@/app/actions/absences", () => absenceActions);

// Camille reads both perspectives, as the reader does on a real backlog.
const camille = { ...LE_POINT_DEMO, personas: { developer: "camille", product: "camille" } };
const ines = { ...LE_POINT_DEMO, personas: { developer: "ines", product: "ines" } };

const headings = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
/** A tile of the summary strip, by its label. */
const tile = (label: string) =>
  screen.getAllByRole("link").find((link) =>
    link.getAttribute("href")?.startsWith("#") && link.firstElementChild?.textContent === label)!;
const section = (name: string) => screen.getByRole("region", { name: new RegExp(`^${name}`) });
/** « Moi »: the reader's own tickets, as before JIR-121. */
const onlyMine = () => window.localStorage.setItem(SCOPE_STORAGE_KEY, "me");

describe("LePointView", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = `${VISIT_COOKIE}=; path=/; max-age=0`;
  });
  afterEach(() => vi.restoreAllMocks());

  it("opens on the developer perspective with its summary strip", () => {
    onlyMine();
    render(<LePointView data={camille} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Le pointpilote");
    expect(screen.getByRole("radio", { name: "Développement" })).toBeChecked();
    expect(tile("En cours")).toHaveTextContent("1");
    expect(tile("Bloqués")).toHaveTextContent("1");
    expect(tile("À venir")).toHaveTextContent("1dont 1 en retard");
    expect(tile("Terminés ou débloqués")).toHaveTextContent("2");
    expect(tile("Bloqués")).toHaveAttribute("href", "#le-point-bloque");
    // Each figure leads to the section that lists exactly its tickets.
    expect(tile("À venir")).toHaveAttribute("href", "#le-point-ensuite");
    expect(screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("#"))).toHaveLength(4);
    expect(headings()).toEqual([
      "Santé du sprint",
      "À reprendre maintenant1",
      "Ce qui te bloque1",
      "À venir1",
      "Depuis ta dernière visite2",
    ]);
  });

  it("shows each ticket in a row that says why it is there and opens it in place", () => {
    onlyMine();
    render(<LePointView data={camille} />);
    const blocked = within(section("Ce qui te bloque"));
    const link = blocked.getByRole("link", { name: /DEMO-15/ });
    expect(link).toHaveAttribute("href", "/b/DEMO/le-point?item=DEMO-15");
    expect(link).toHaveAttribute("title", "Attend DEMO-9 « API de signature électronique », en cours chez Hugo Lefèvre.");
    // The tag sits under the row's stretched link, not above it: clicking it opens the ticket.
    const tag = blocked.getByText("Attend DEMO-9");
    expect(tag.closest(".relative")).toBe(tag.closest("li"));
    expect(within(section("À venir")).getByText("En retard de 6 jours")).toBeVisible();
    expect(screen.getByText("Sans échéance (1)")).toBeVisible();
  });

  it("counts only the late tickets of « À venir » in its figure", () => {
    onlyMine();
    const tickets = camille.tickets.map((ticket) => (ticket.key === "DEMO-15" ? { ...ticket, due: "2026-11-01" } : ticket));
    render(<LePointView data={{ ...camille, tickets }} />);
    // « À venir » counts its own late tickets only; DEMO-15 is listed as blocked.
    expect(tile("À venir")).toHaveTextContent("dont 1 en retard");
    expect(within(section("Ce qui te bloque")).getByRole("link", { name: /DEMO-15/ })).toBeVisible();
  });

  it("switches to the product perspective and remembers it", async () => {
    onlyMine();
    render(<LePointView data={ines} />);
    await userEvent.click(screen.getByRole("radio", { name: "Produit" }));
    expect(window.localStorage.getItem(PERSPECTIVE_STORAGE_KEY)).toBe("product");
    expect(tile("Décisions à prendre")).toHaveTextContent("1");
    expect(tile("Prochaine livraison")).toHaveTextContent("1.3");
    const decisions = within(section("Décisions qui t’attendent"));
    expect(decisions.getByText("Demandé par Hugo L.")).toBeVisible();
    expect(decisions.getByText("Inès G.")).toBeVisible();
    const objectives = within(section("Objectifs"));
    expect(objectives.getByRole("link", { name: /DEMO-2/ })).toHaveAttribute("href", "/b/DEMO/le-point?item=DEMO-2");
    expect(objectives.getByText("14 nov. · 1.3 · 14 nov.")).toBeVisible();
    expect(objectives.getByRole("img", { name: "5 terminés sur 9, 2 en cours, 1 bloqué" })).toBeInTheDocument();
    expect(within(section("Ce qui met un objectif en difficulté")).getAllByText("Sans assigné").length).toBeGreaterThan(0);
  });

  it("restores the remembered perspective, and still works when storage is refused", () => {
    window.localStorage.setItem(PERSPECTIVE_STORAGE_KEY, "product");
    const { unmount } = render(<LePointView data={ines} />);
    expect(screen.getByRole("radio", { name: "Produit" })).toBeChecked();
    unmount();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    render(<LePointView data={ines} />);
    expect(screen.getByRole("radio", { name: "Développement" })).toBeChecked();
  });

  it("moves between perspectives with the arrow keys", async () => {
    render(<LePointView data={camille} />);
    screen.getByRole("radio", { name: "Développement" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Produit" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Produit" })).toBeChecked();
  });

  it("shows the project trail above the title, back to the project", () => {
    render(
      <ShellDataProvider backlogs={[{ id: "b-demo", key: "DEMO", name: "DÉMO — Portail des décisions" }]} views={[]}>
        <LePointView data={camille} />
      </ShellDataProvider>,
    );
    const trail = screen.getByRole("navigation", { name: "Fil d’Ariane" });
    expect(within(trail).getByRole("link", { name: "DÉMO — Portail des décisions" })).toHaveAttribute("href", "/b/DEMO");
    expect(trail.compareDocumentPosition(screen.getByRole("heading", { level: 1 })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names the first visit's window", () => {
    render(<LePointView data={{ ...camille, firstVisit: true }} />);
    expect(screen.getByRole("heading", { name: /^Ces 7 derniers jours/ })).toBeVisible();
    expect(tile("Terminés ou débloqués")).toHaveTextContent("ces 7 derniers jours");
  });

  it("records today's visit on the device, for every backlog", () => {
    render(<LePointView data={camille} />);
    expect(document.cookie).toContain(`${VISIT_COOKIE}=.2026-11-03`);
  });
});

describe("LePointView, whole team (JIR-121)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = `${VISIT_COOKIE}=; path=/; max-age=0`;
  });

  it("opens on the whole team, its controls in the toolbar under the header", () => {
    render(<LePointView data={camille} />);
    expect(screen.getByRole("radio", { name: "Toute l’équipe" })).toBeChecked();
    const toolbar = document.querySelector('[data-slot="page-toolbar"]')!;
    expect(within(toolbar as HTMLElement).getByRole("radiogroup", { name: "Perspective" })).toBeVisible();
    expect(within(toolbar as HTMLElement).getByRole("radiogroup", { name: "Portée" })).toBeVisible();
    expect(screen.getByText(/^Ce que l’équipe a en cours/)).toBeVisible();
  });

  it("lists every developer's tickets with who holds them, and each person's load", () => {
    const view = developerView(camille, { kind: "team" });
    render(<LePointView data={camille} />);
    expect(tile("En cours")).toHaveTextContent(String(view.resume.length));
    expect(tile("Bloqués")).toHaveTextContent(String(view.blocked.length));
    expect(headings()).toEqual(expect.arrayContaining([
      expect.stringMatching(/^En cours/),
      expect.stringMatching(/^Ce qui bloque l’équipe/),
    ]));
    // More than the reader's own: several people hold the work in progress.
    const holders = new Set(view.resume.map((card) => card.assigneeName));
    expect(holders.size).toBeGreaterThan(1);
    // The team's load sits in the sprint's card: one chip per person, the busiest first.
    const chips = within(section("Santé du sprint")).getAllByRole("button", { name: /tickets? ouverts?$/ });
    expect(chips).toHaveLength(view.workload.length);
    expect(chips[0]).toHaveAccessibleName(new RegExp(`^${view.workload[0]!.name}`));
  });

  it("reads the sprint at a glance: verdict, bar, forecast, figures, and a chip per person (JIR-124)", () => {
    render(<LePointView data={camille} />);
    const sprint = section("Santé du sprint");
    expect(within(sprint).getByText("À surveiller")).toBeVisible();
    expect(sprint).toHaveTextContent("Sprint 8 · jour 8 sur 12 · fin le 7 nov.");
    // The scope on one bar, done then under way, with today's mark.
    expect(within(sprint).getByRole("img", { name: "42 % terminé, 37 % en cours, 21 % à faire ; 64 % du temps écoulé" })).toBeInTheDocument();
    expect(within(sprint).getByText("Aujourd’hui · 64 % du temps")).toBeVisible();
    expect(sprint).toHaveTextContent("Reste 25 pts pour 4 jours ouvrés et 4 personnes présentes : il faudrait 1,6 pt par jour-personne, contre 0,9 pt jusqu’ici.");
    // Four figures: done, blocked, added, days left.
    expect(sprint).toHaveTextContent("18/ 43 pts3 sur 11 tickets");
    expect(sprint).toHaveTextContent("2bloquésDEMO-15, DEMO-33");
    expect(sprint).toHaveTextContent("+1ajouté5 % de l’engagement initial");
    expect(sprint).toHaveTextContent("4 jouvrés restants16 jours-personne, 4 personnes présentes");
    expect(within(sprint).getByRole("link", { name: "Voir le burndown" })).toHaveAttribute("href", "/b/DEMO/reports?report=burndown");
    // One chip per person: the fact in its name, the colour in its dot, nothing open yet.
    const chip = (name: string) => within(sprint).getByRole("button", { name: new RegExp(`^${name}`) });
    expect(chip("Camille Morel")).toHaveAccessibleName("Camille Morel, 1 bloqué, 4 tickets ouverts");
    expect(chip("Hugo Lefèvre")).toHaveAccessibleName("Hugo Lefèvre, En rythme, 1 ticket ouvert");
    expect(chip("Inès Garnier")).toHaveAccessibleName("Inès Garnier, Rien en cours, 1 ticket ouvert");
    expect(chip("Sans assigné")).toHaveAccessibleName("Sans assigné, 1 ticket ouvert");
    expect(within(sprint).queryByRole("link", { name: "Voir dans la Liste" })).toBeNull();
  });

  it("opens a person from their chip, with why each ticket counts and the way to the Liste (JIR-124)", async () => {
    const view = developerView(camille, { kind: "team" });
    render(<LePointView data={camille} />);
    const sprint = section("Santé du sprint");
    // The card is everyone's: it sits above the perspective and scope controls.
    expect(sprint.compareDocumentPosition(screen.getByRole("radiogroup", { name: "Perspective" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const person = within(sprint).getByRole("button", { name: /^Camille Morel/ });
    expect(person).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(person);
    expect(person).toHaveAttribute("aria-expanded", "true");
    expect(within(sprint).getAllByRole("link", { name: /DEMO-\d+/ }).map((link) => link.getAttribute("href"))).toEqual([
      "/b/DEMO/le-point?item=DEMO-15",
      "/b/DEMO/le-point?item=DEMO-12",
      "/b/DEMO/le-point?item=DEMO-21",
      "/b/DEMO/le-point?item=DEMO-22",
    ]);
    expect(within(sprint).getByText("Attend DEMO-9")).toBeVisible();
    expect(within(sprint).getByText("Hors sprint")).toBeVisible();
    expect(within(sprint).getByText("28 oct. 2026")).toBeVisible();
    expect(within(sprint).getByRole("link", { name: "Voir dans la Liste" })).toHaveAttribute("href", "/b/DEMO?view=list&assignee=camille");
    await userEvent.click(person);
    expect(person).toHaveAttribute("aria-expanded", "false");
    expect(within(sprint).queryByRole("link", { name: "Voir dans la Liste" })).toBeNull();
    // « Tout voir » gives the full table, one row per person with its facts.
    await userEvent.click(within(sprint).getByRole("button", { name: "Tout voir" }));
    const rows = within(sprint).getAllByRole("listitem");
    expect(rows).toHaveLength(view.workload.length);
    expect(rows[0]).toHaveTextContent("Camille Morel");
    expect(rows[0]).toHaveTextContent("DEMO-15 bloqué.");
  });

  it("shows a member without an open ticket and counts them present (JIR-124 C)", async () => {
    const leo = { id: "leo", name: "Léo Bernard" };
    render(<LePointView data={{ ...camille, members: [...camille.members!, leo] }} />);
    const sprint = section("Santé du sprint");
    expect(within(sprint).getByRole("heading", { name: "Charge par personne 6" })).toBeVisible();
    const person = within(sprint).getByRole("button", { name: "Léo Bernard, Rien en cours, aucun ticket ouvert" });
    expect(person).toHaveTextContent("rien d’assigné");
    const chips = within(sprint).getAllByRole("button", { name: /ticket[s]? ouvert[s]?$/ });
    expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual([
      "Camille Morel, 1 bloqué, 4 tickets ouverts", "Léa Martin, 1 bloqué, 3 tickets ouverts",
      "Hugo Lefèvre, En rythme, 1 ticket ouvert", "Inès Garnier, Rien en cours, 1 ticket ouvert",
      "Léo Bernard, Rien en cours, aucun ticket ouvert", "Sans assigné, 1 ticket ouvert",
    ]);
    expect(sprint).toHaveTextContent("Reste 25 pts pour 4 jours ouvrés et 5 personnes présentes : il faudrait 1,3 pt par jour-personne, contre 0,7 pt jusqu’ici.");
    expect(sprint).toHaveTextContent("20 jours-personne, 5 personnes présentes");
    await userEvent.click(person);
    expect(person).toHaveAttribute("aria-expanded", "true");
    expect(within(sprint).getByText("Aucun ticket ouvert.")).toBeVisible();
    expect(within(sprint).getByRole("link", { name: "Voir dans la Liste" })).toHaveAttribute("href", "/b/DEMO?view=list&assignee=leo");
    await userEvent.click(within(sprint).getByRole("button", { name: "Tout voir" }));
    const rows = within(sprint).getAllByRole("listitem");
    expect(rows).toHaveLength(6);
    expect(rows[4]).toHaveTextContent("Léo Bernard");
    expect(rows[4]).toHaveTextContent("aucun ticket ouvert");
    expect(rows[5]).toHaveTextContent("Sans assigné");
    await userEvent.click(within(rows[4]!).getByRole("button"));
    expect(within(rows[4]!).getByText("Aucun ticket ouvert.")).toBeVisible();
  });

  it("keeps the existing load and projection when the directory is unavailable", () => {
    render(<LePointView data={{ ...camille, members: [], people: [...camille.people, { id: "leo", name: "Léo Bernard" }] }} />);
    const sprint = section("Santé du sprint");
    expect(within(sprint).queryByRole("button", { name: /^Léo Bernard/ })).toBeNull();
    expect(within(sprint).getByRole("heading", { name: "Charge par personne 5" })).toBeVisible();
    expect(sprint).toHaveTextContent("Reste 25 pts pour 4 jours ouvrés et 4 personnes présentes : il faudrait 1,6 pt par jour-personne, contre 0,9 pt jusqu’ici.");
  });

  it("lets a known member with no ticket open their detail even without an active sprint", async () => {
    render(<LePointView data={{ ...camille, sprint: null, tickets: [], members: [{ id: "leo", name: "Léo Bernard" }] }} />);
    const sprint = section("Santé du sprint");
    expect(sprint).toHaveTextContent("Aucun sprint actif");
    const person = within(sprint).getByRole("button", { name: "Léo Bernard, Rien en cours, aucun ticket ouvert" });
    await userEvent.click(person);
    expect(within(sprint).getByText("Aucun ticket ouvert.")).toBeVisible();
    await userEvent.click(within(sprint).getByRole("button", { name: "Tout voir" }));
    const row = within(sprint).getByRole("listitem");
    expect(row).toHaveTextContent("Léo Bernard");
    expect(row).toHaveTextContent("aucun ticket ouvert");
  });

  it("keeps the same card for everyone, whatever the perspective or the scope", async () => {
    render(<LePointView data={camille} />);
    const chips = () => within(section("Santé du sprint")).getAllByRole("button", { name: /tickets? ouverts?$/ }).length;
    expect(chips()).toBe(5);
    await userEvent.click(screen.getByRole("radio", { name: "Produit" }));
    expect(chips()).toBe(5);
    await userEvent.click(screen.getByRole("radio", { name: "Moi" }));
    expect(chips()).toBe(5);
    expect(headings()[0]).toBe("Santé du sprint");
  });

  it("shows the sprint's goal, and opens its scope: the commitment against the velocity, then every change (JIR-124)", async () => {
    render(<LePointView data={camille} />);
    const sprint = section("Santé du sprint");
    expect(sprint).toHaveTextContent("Objectif : Publier les arrêts et préparer la recherche avancée");
    const tile = within(sprint).getByRole("button", { name: /^\+1ajouté/ });
    expect(tile).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(tile);
    expect(within(sprint).getByRole("img", { name: "Engagement au démarrage : 41 pts" })).toBeInTheDocument();
    expect(within(sprint).getByRole("img", { name: "Vélocité moyenne, 3 derniers sprints : 38 pts" })).toBeInTheDocument();
    expect(within(sprint).getByRole("img", { name: "Périmètre aujourd’hui : 43 pts" })).toBeInTheDocument();
    expect(sprint).toHaveTextContent("10 tickets embarqués au démarrage ; depuis, 1 ajouté. L’engagement dépasse de 3 points la vélocité moyenne.");
    expect(sprint).toHaveTextContent("AjoutéDEMO-33Habilitations greffe2 pts · le 29 oct. par Léa Martin");
    expect(within(sprint).getByRole("link", { name: "DEMO-33" })).toHaveAttribute("href", "/b/DEMO/le-point?item=DEMO-33");
    expect(within(sprint).getByRole("link", { name: "Voir le rapport de sprint" })).toHaveAttribute("href", "/b/DEMO/reports?report=sprint");
    await userEvent.click(tile);
    expect(within(sprint).queryByRole("link", { name: "Voir le rapport de sprint" })).toBeNull();
  });

  it("keeps the scope's journal reachable once the last ticket left the sprint, and names an unknown author", async () => {
    const emptied = {
      ...camille,
      tickets: camille.tickets.map((ticket) => ({ ...ticket, inSprint: false })),
      sprint: {
        ...camille.sprint!,
        commitment: { points: 5, tickets: 1 },
        changes: [{ kind: "removed" as const, key: "DEMO-12", title: "Générer le PDF signé d’un arrêt", points: 5, day: "2026-11-02", actor: null }],
      },
    };
    render(<LePointView data={emptied} />);
    const sprint = section("Santé du sprint");
    expect(sprint).toHaveTextContent("Le sprint ne contient aucun ticket.");
    await userEvent.click(within(sprint).getByRole("button", { name: /^−1retiré/ }));
    expect(sprint).toHaveTextContent("1 ticket embarqué au démarrage ; depuis, 1 retiré.");
    expect(sprint).toHaveTextContent("RetiréDEMO-12Générer le PDF signé d’un arrêt5 pts · le 2 nov. par quelqu’un");
  });

  it("words the gap between commitment and velocity on the figure it shows", async () => {
    const close = { ...camille, sprint: { ...camille.sprint!, commitment: { points: 2.3, tickets: 10 }, velocity: 0.3 } };
    render(<LePointView data={close} />);
    const sprint = section("Santé du sprint");
    await userEvent.click(within(sprint).getByRole("button", { name: /^\+1ajouté/ }));
    expect(within(sprint).getByRole("img", { name: "Vélocité moyenne, 3 derniers sprints : 0,3 pt" })).toBeInTheDocument();
    expect(sprint).toHaveTextContent("L’engagement dépasse de 2 points la vélocité moyenne.");
  });

  it("says who is away and until when, and lets the reader declare their own absence (JIR-124)", async () => {
    const backlog = { ...camille.backlog, id: "11111111-1111-4111-8111-111111111111" };
    const away = {
      ...camille, backlog,
      absences: [
        { id: "a1", user: "hugo", start: "2026-11-03", end: "2026-11-06" },
        { id: "a2", user: "hugo", start: "2026-11-09", startHalf: "pm" as const, end: "2026-11-10", endHalf: "am" as const },
      ],
    };
    absenceActions.declareAbsenceAction.mockResolvedValue({ ok: true });
    render(<LePointView data={away} />);
    const sprint = section("Santé du sprint");
    const hugo = within(sprint).getByRole("button", { name: "Hugo Lefèvre, En congé jusqu’au 6 nov., 1 ticket ouvert" });
    expect(hugo).toHaveTextContent("en congé jusqu’au 6 nov.");
    // Three of the four people are there today, and Hugo's four days are off the person-days.
    expect(sprint).toHaveTextContent("12 jours-personne, 3 personnes présentes");
    await userEvent.click(hugo);
    expect(within(sprint).getByText("Absent du 3 nov. au 6 nov.")).toBeVisible();
    expect(within(sprint).getByText("Absent du 9 nov. après-midi au 10 nov. matin")).toBeVisible();
    expect(within(sprint).queryByRole("button", { name: "Retirer" })).toBeNull();
    expect(within(sprint).queryByRole("button", { name: "Déclarer une absence" })).toBeNull();
    // The reader declares their own, whole days both included, from today by default.
    await userEvent.click(within(sprint).getByRole("button", { name: /^Camille Morel/ }));
    await userEvent.click(within(sprint).getByRole("button", { name: "Déclarer une absence" }));
    await userEvent.click(within(sprint).getByRole("button", { name: "Enregistrer" }));
    expect(absenceActions.declareAbsenceAction).toHaveBeenCalledWith({ userId: "camille", backlogId: backlog.id, startDate: "2026-11-03", startHalf: "am", endDate: "2026-11-03", endHalf: "pm" });
  });

  it("explains its rules on request, in a dialog, and gives the focus back to its button", async () => {
    render(<LePointView data={camille} />);
    const button = within(section("Santé du sprint")).getByRole("button", { name: "Comment est-ce calculé ?" });
    await userEvent.click(button);
    const dialog = screen.getByRole("dialog", { name: "Comment est-ce calculé ?" });
    expect(dialog).toHaveTextContent("En retard au-delà de 25 points d’écart.");
    expect(dialog).toHaveTextContent("Va-t-on finir ?");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("says so without an active sprint", () => {
    render(<LePointView data={{ ...camille, sprint: null }} />);
    expect(section("Santé du sprint")).toHaveTextContent("Aucun sprint actif : rien à évaluer.");
    expect(screen.queryByRole("link", { name: "Voir le burndown" })).toBeNull();
  });

  it("lists every pending decision with who it is asked of", async () => {
    const { decisions } = productView(camille, { kind: "team" });
    render(<LePointView data={camille} />);
    await userEvent.click(screen.getByRole("radio", { name: "Produit" }));
    expect(tile("Décisions en attente")).toHaveTextContent(String(decisions.length));
    const pending = within(section("Décisions en attente"));
    expect(pending.getAllByRole("listitem")).toHaveLength(decisions.length);
    expect(pending.getByText(decisions[0]!.tag)).toBeVisible();
  });

  it("switches to « Moi » and remembers it", async () => {
    render(<LePointView data={camille} />);
    await userEvent.click(screen.getByRole("radio", { name: "Moi" }));
    expect(window.localStorage.getItem(SCOPE_STORAGE_KEY)).toBe("me");
    expect(headings()).toEqual([
      "Santé du sprint",
      "À reprendre maintenant1",
      "Ce qui te bloque1",
      "À venir1",
      "Depuis ta dernière visite2",
    ]);
  });
});

describe("ticketHref", () => {
  it("opens a dependency of another backlog on its own backlog", () => {
    expect(ticketHref("DATA-50", "DEMO")).toBe("/b/DATA?item=DATA-50");
    expect(ticketHref("MY-APP-7", "MY-APP")).toBe("/b/MY-APP/le-point?item=MY-APP-7");
  });
});
