import { expect, type Locator, type Page } from "@playwright/test";

export const AUDIT_PAGES = [
  { name: "p1-accueil", url: "/", heading: "Backlogs" },
  { name: "p2-board", url: "/b/CASS?view=board", heading: "Board" },
  { name: "p3-liste", url: "/b/CASS?view=list", heading: "Liste" },
  { name: "p4-tiroir", url: "/b/CASS?view=list", heading: "Liste" },
  { name: "p5-le-point", url: "/b/CASS/le-point", heading: "Le point" },
  { name: "p6-aide", url: "/aide", heading: "Guide d’utilisation" },
  { name: "p7-reglages", url: "/b/CASS/settings/access", heading: "Accès — Cour de cassation" },
] as const;
export type AuditPage = (typeof AUDIT_PAGES)[number];

/** Each landmark is present after its page's streamed data has rendered. */
export async function openAuditPage(page: Page, target: AuditPage) {
  await page.goto(target.url);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: target.heading, exact: target.name !== "p5-le-point" })).toBeVisible();
  if (target.name === "p1-accueil") {
    await expect(main.locator('[data-backlog-row="CASS"]')).toBeVisible();
  } else if (target.name === "p2-board") {
    await expect(main.getByRole("group", { name: /, \d+ items?$/ }).first()).toBeVisible();
  } else if (target.name === "p3-liste" || target.name === "p4-tiroir") {
    const item = main.locator('[data-shortcut-item^="CASS-"]').first();
    await expect(item).toBeVisible();
    if (target.name === "p4-tiroir") {
      await item.click();
      await expect(page.getByRole("dialog", { name: /^CASS-\d+ —/ })).toBeVisible();
    }
  } else if (target.name === "p5-le-point") {
    await expect(main.getByRole("button", { name: "Comment est-ce calculé ?", exact: true })).toBeVisible();
  } else if (target.name === "p6-aide") {
    await expect(main.getByRole("navigation", { name: "Sommaire du guide" }).filter({ visible: true }).first()).toBeVisible();
  } else {
    await expect(main.getByRole("heading", { name: "Assistant de permissions", exact: true })).toBeVisible();
  }
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}

/** Real, non-destructive actions: open CASS, create dialog, close drawer, rules,
 * guide TOC toggle, and permission helper. The P1/P4 choices were explicitly approved. */
export async function primaryAuditAction(page: Page, target: AuditPage): Promise<Locator> {
  switch (target.name) {
    case "p1-accueil": return page.locator('[data-backlog-row="CASS"]').getByRole("link", { name: "Cour de cassation", exact: true });
    case "p2-board":
    case "p3-liste": return page.locator('[data-slot="shell-topbar"]').getByRole("button", { name: "Créer", exact: true });
    case "p4-tiroir": return page.getByRole("dialog", { name: /^CASS-\d+ —/ }).getByRole("button", { name: "Fermer (Échap)", exact: true });
    case "p5-le-point": return page.getByRole("button", { name: "Comment est-ce calculé ?", exact: true });
    case "p6-aide": return page.getByRole("navigation", { name: "Sommaire du guide" }).locator("summary").filter({ hasText: "Sommaire" });
    case "p7-reglages":
      await page.getByRole("combobox", { name: "Utilisateur à vérifier", exact: true }).selectOption({ label: "Administrateur E2E" });
      return page.getByRole("button", { name: "Vérifier la permission", exact: true });
  }
}

export async function expectAuditActionResult(page: Page, target: AuditPage) {
  switch (target.name) {
    case "p1-accueil": await expect(page).toHaveURL(/\/b\/CASS$/); break;
    case "p2-board":
    case "p3-liste": await expect(page.getByRole("dialog", { name: "Nouvel item", exact: true })).toBeVisible(); break;
    case "p4-tiroir": await expect(page.getByRole("dialog", { name: /^CASS-\d+ —/ })).toHaveCount(0); break;
    case "p5-le-point": await expect(page.getByRole("dialog", { name: "Comment est-ce calculé ?", exact: true })).toBeVisible(); break;
    case "p6-aide": await expect(page.getByRole("navigation", { name: "Sommaire du guide" }).getByRole("link", { name: /Démarrer/ }).filter({ visible: true })).toBeVisible(); break;
    case "p7-reglages": await expect(page.getByRole("heading", { name: "Autorisé", exact: true })).toBeVisible(); break;
  }
}
