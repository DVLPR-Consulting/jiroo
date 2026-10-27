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
      "Feu du sprint",
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
      expect.stringMatching(/^Charge par personne/),
    ]));
    // More than the reader's own: several people hold the work in progress.
    const holders = new Set(view.resume.map((card) => card.assigneeName));
    expect(holders.size).toBeGreaterThan(1);
    const workload = within(section("Charge par personne")).getAllByRole("listitem");
    expect(workload).toHaveLength(view.workload.length);
    expect(workload[0]).toHaveTextContent(view.workload[0]!.name);
  });

  it("shows the sprint's light with its reasons and the burndown, and a light per person (JIR-124)", () => {
    render(<LePointView data={camille} />);
    const sprint = section("Feu du sprint");
    expect(sprint).toHaveTextContent("Orange · Sprint 8. À surveiller : 64 % du temps écoulé pour 42 % des points terminés, 2 tickets bloqués.");
    expect(within(sprint).getByText("2 tickets bloqués : DEMO-15, DEMO-33.")).toBeVisible();
    expect(within(sprint).getByRole("img", { name: "Temps écoulé : 64 %" })).toBeVisible();
    expect(within(sprint).getByRole("img", { name: "Points terminés : 42 %" })).toBeVisible();
    expect(within(sprint).getByRole("link", { name: "Voir le burndown" })).toHaveAttribute("href", "/b/DEMO/reports?report=burndown");
    const row = (name: string) => within(section("Charge par personne")).getByText(name).closest("li")!;
    expect(row("Camille Morel")).toHaveTextContent("À surveiller");
    expect(row("Camille Morel").querySelector("[title]")).toHaveAttribute("title", "1 ticket bloqué.\n1 ticket en cours, 2 à faire.\nDEMO-15 bloqué.");
    expect(row("Hugo Lefèvre")).toHaveTextContent("En rythme");
    expect(row("Inès Garnier")).toHaveTextContent("Disponible");
    expect(row("Sans assigné")).not.toHaveTextContent(/En rythme|À surveiller|Disponible/);
  });

  it("says so without an active sprint", () => {
    render(<LePointView data={{ ...camille, sprint: null }} />);
    expect(section("Feu du sprint")).toHaveTextContent("Aucun sprint actif : pas de feu.");
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
      "Feu du sprint",
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
