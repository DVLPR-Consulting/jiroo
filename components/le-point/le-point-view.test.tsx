import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LePointView, PERSPECTIVE_STORAGE_KEY, ticketHref } from "@/components/le-point/le-point-view";
import { ShellBreadcrumb } from "@/components/shell/shell-breadcrumb";
import { ShellDataProvider } from "@/components/shell/shell-data";
import { LE_POINT_DEMO } from "@/lib/le-point/fixtures";
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
  [...document.querySelectorAll<HTMLElement>("a[href^='#'], div")].find((box) =>
    box.firstElementChild?.tagName === "SPAN" && box.firstElementChild.textContent === label)!;
const section = (name: string) => screen.getByRole("region", { name: new RegExp(`^${name}`) });

describe("LePointView", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = `${VISIT_COOKIE}=; path=/; max-age=0`;
  });
  afterEach(() => vi.restoreAllMocks());

  it("opens on the developer perspective with its summary strip", () => {
    render(<LePointView data={camille} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Le pointpilote");
    expect(screen.getByRole("radio", { name: "Développement" })).toBeChecked();
    expect(tile("En cours")).toHaveTextContent("1");
    expect(tile("Bloqués")).toHaveTextContent("1");
    expect(tile("En retard")).toHaveTextContent("1");
    expect(tile("Terminés ou débloqués")).toHaveTextContent("2");
    expect(tile("Bloqués")).toHaveAttribute("href", "#le-point-bloque");
    // Late tickets sit in several sections: the figure leads nowhere in particular.
    expect(tile("En retard").tagName).toBe("DIV");
    expect(headings()).toEqual([
      "À reprendre maintenant1",
      "Ce qui te bloque1",
      "À venir1",
      "Depuis ta dernière visite2",
    ]);
  });

  it("shows each ticket in a row that says why it is there and opens it in place", () => {
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

  it("counts every late ticket of the reader, blocked ones included", () => {
    const tickets = camille.tickets.map((ticket) => (ticket.key === "DEMO-15" ? { ...ticket, due: "2026-11-01" } : ticket));
    render(<LePointView data={{ ...camille, tickets }} />);
    expect(tile("En retard")).toHaveTextContent("2");
  });

  it("switches to the product perspective and remembers it", async () => {
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
        <LePointView data={camille} breadcrumb={<ShellBreadcrumb />} />
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

describe("ticketHref", () => {
  it("opens a dependency of another backlog on its own backlog", () => {
    expect(ticketHref("DATA-50", "DEMO")).toBe("/b/DATA?item=DATA-50");
    expect(ticketHref("MY-APP-7", "MY-APP")).toBe("/b/MY-APP/le-point?item=MY-APP-7");
  });
});
