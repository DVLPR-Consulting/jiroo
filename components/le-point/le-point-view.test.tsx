import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LePointView, PERSPECTIVE_STORAGE_KEY, ticketHref } from "@/components/le-point/le-point-view";
import { LE_POINT_DEMO } from "@/lib/le-point/fixtures";
import { ShellBreadcrumb } from "@/components/shell/shell-breadcrumb";
import { ShellDataProvider } from "@/components/shell/shell-data";
import { VISIT_COOKIE } from "@/lib/le-point/visit";

vi.mock("next/navigation", () => ({
  usePathname: () => "/b/DEMO/le-point",
  useSearchParams: () => new URLSearchParams(),
}));


const headings = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

describe("LePointView", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("says the data is a demonstration and opens on the developer perspective", () => {
    render(<LePointView data={LE_POINT_DEMO} />);
    expect(screen.getByRole("note")).toHaveTextContent(
      "Données de démonstration — rien n’est enregistré. Nous sommes le mardi 3 novembre 2026.",
    );
    expect(screen.getByRole("radio", { name: "Développement" })).toBeChecked();
    expect(screen.getByText(/vu par Camille Morel, développeuse/)).toBeVisible();
    expect(headings()).toEqual([
      "À reprendre maintenant",
      "Ce qui t’empêche d’avancer",
      "Ensuite",
      "Depuis ta dernière visite",
    ]);
  });

  it("shows why each card is there", () => {
    render(<LePointView data={LE_POINT_DEMO} />);
    const resume = screen.getByRole("region", { name: "À reprendre maintenant" });
    expect(within(resume).getByText("Générer le PDF signé d’un arrêt")).toBeVisible();
    expect(within(resume).getByText("En cours ; échéance le 5 nov., dans 2 jours.")).toBeVisible();
    const blocked = screen.getByRole("region", { name: "Ce qui t’empêche d’avancer" });
    expect(within(blocked).getByRole("button", { name: "Ouvrir DEMO-9" })).toBeVisible();
  });

  it("switches to the product perspective and remembers it", async () => {
    const user = userEvent.setup();
    render(<LePointView data={LE_POINT_DEMO} />);
    await user.click(screen.getByRole("radio", { name: "Produit" }));
    expect(screen.getByText(/vu par Inès Garnier, PO/)).toBeVisible();
    expect(headings()).toEqual([
      "Décisions qui t’attendent",
      "Où en sont les objectifs(epics)",
      "Ce qui met un objectif en difficulté",
      "Prochaine livraison(release)",
    ]);
    expect(screen.getByText("Terminé — pas encore livré : la livraison 1.3 n’est pas publiée.", { exact: false })).toBeVisible();
    expect(window.localStorage.getItem(PERSPECTIVE_STORAGE_KEY)).toBe("product");
  });

  it("restores the remembered perspective", () => {
    window.localStorage.setItem(PERSPECTIVE_STORAGE_KEY, "product");
    render(<LePointView data={LE_POINT_DEMO} />);
    expect(screen.getByRole("radio", { name: "Produit" })).toBeChecked();
  });

  it("still works when the browser refuses storage", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const user = userEvent.setup();
    render(<LePointView data={LE_POINT_DEMO} />);
    await user.click(screen.getByRole("radio", { name: "Produit" }));
    expect(screen.getByRole("radio", { name: "Produit" })).toBeChecked();
  });

  it("moves between perspectives with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<LePointView data={LE_POINT_DEMO} />);
    screen.getByRole("radio", { name: "Développement" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Produit" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Produit" })).toBeChecked();
  });

  it("opens a ticket read-only and follows its dependency", async () => {
    const user = userEvent.setup();
    render(<LePointView data={LE_POINT_DEMO} />);
    await user.click(screen.getByRole("button", { name: "Ouvrir DEMO-15 — Afficher l’arrêt publié" }));
    const panel = screen.getByRole("dialog", { name: "DEMO-15 — Afficher l’arrêt publié" });
    expect(within(panel).getByText("Démonstration · lecture seule")).toBeVisible();
    expect(within(panel).queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "DEMO-9" }));
    expect(screen.getByRole("dialog", { name: "DEMO-9 — API de signature électronique" })).toBeVisible();
  });

  it("gives the focus back to the opening button on Escape, even after following a dependency", async () => {
    const user = userEvent.setup();
    render(<LePointView data={LE_POINT_DEMO} />);
    const opener = screen.getByRole("button", { name: "Ouvrir DEMO-15 — Afficher l’arrêt publié" });
    await user.click(opener);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "DEMO-9" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("states an unknown activity instead of inventing one", async () => {
    const user = userEvent.setup();
    render(<LePointView data={LE_POINT_DEMO} />);
    await user.click(screen.getByRole("radio", { name: "Produit" }));
    await user.click(screen.getByRole("button", { name: "Ouvrir DEMO-2 — Publier les arrêts en ligne" }));
    await user.click(screen.getByRole("button", { name: /DEMO-27/ }));
    expect(screen.getByText("Aucune activité connue depuis le 20 oct.")).toBeVisible();
  });
});

describe("LePointView pilot", () => {
  const real = { ...LE_POINT_DEMO, personas: { developer: "camille", product: "camille" } };

  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = `${VISIT_COOKIE}=; path=/; max-age=0`;
  });

  it("says the tickets are real and read-only, in the project's own view", () => {
    render(<LePointView data={real} pilot />);
    expect(screen.getByRole("note")).toHaveTextContent("Pilote — tes vrais tickets, en lecture seule");
    expect(screen.getByText("DÉMO — Portail des décisions · vu par Camille Morel")).toBeVisible();
    // The sidebar picks the project: no second backlog picker in the page.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows the project trail above the title, back to the project", () => {
    render(
      <ShellDataProvider backlogs={[{ id: "b-demo", key: "DEMO", name: "DÉMO — Portail des décisions" }]} views={[]}>
        <LePointView data={real} pilot breadcrumb={<ShellBreadcrumb />} />
      </ShellDataProvider>,
    );
    const trail = screen.getByRole("navigation", { name: "Fil d’Ariane" });
    expect(within(trail).getByRole("link", { name: "DÉMO — Portail des décisions" })).toHaveAttribute("href", "/b/DEMO");
    expect(within(trail).getByText("Le point")).toBeVisible();
    expect(trail.compareDocumentPosition(screen.getByRole("heading", { level: 1 })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names the first visit's window", () => {
    render(<LePointView data={{ ...real, firstVisit: true }} pilot />);
    expect(screen.getByRole("heading", { name: "Ces 7 derniers jours" })).toBeVisible();
  });

  it("opens the real ticket in place, without leaving Le point", async () => {
    render(<LePointView data={real} pilot />);
    await userEvent.click(screen.getByRole("button", { name: /Ouvrir DEMO-12/ }));
    expect(screen.getByRole("link", { name: "Ouvrir le ticket" })).toHaveAttribute("href", "/b/DEMO/le-point?item=DEMO-12");
  });

  it("records today's visit on the device, for every backlog", () => {
    render(<LePointView data={real} pilot />);
    expect(document.cookie).toContain(`${VISIT_COOKIE}=.2026-11-03`);
  });
});

describe("ticketHref", () => {
  it("opens a dependency of another backlog on its own backlog", () => {
    expect(ticketHref("DATA-50", "DEMO")).toBe("/b/DATA?item=DATA-50");
    expect(ticketHref("MY-APP-7", "MY-APP")).toBe("/b/MY-APP/le-point?item=MY-APP-7");
  });
});
