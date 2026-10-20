import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { writeAuditScreenshot, writeAuditText } from "./audit-artifacts";

const RUN = process.env.JIROO_E2E_RUN_ID;
if (!RUN) throw new Error("Le point E2E requires an isolated run id.");
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
type Capture = { console: string[]; network: string[]; errors: string[]; navigating: boolean };

const test = base.extend<{ audit: Capture }>({
  audit: [async ({ page }, runTest, info) => {
    const capture: Capture = { console: [`run=${RUN}`], network: [`run=${RUN}`], errors: [], navigating: false };
    page.on("console", (message) => {
      capture.console.push(`[${message.type()}] ${message.text()}`);
      if (message.type() === "error") capture.errors.push(message.text());
    });
    page.on("pageerror", (error) => capture.errors.push(error.message));
    page.on("request", (request) => {
      const line = `${request.method()} ${request.url()}`;
      capture.network.push(line);
      if (!["GET", "HEAD"].includes(request.method())) capture.errors.push(`Write request: ${line}`);
      if (Object.hasOwn(request.headers(), "next-action")) capture.errors.push(`Server Action: ${line}`);
    });
    page.on("response", (response) => {
      capture.network.push(`${response.status()} ${response.url()}`);
      if (response.status() >= 400) capture.errors.push(`${response.status()} ${response.url()}`);
    });
    page.on("requestfailed", (request) => {
      const error = request.failure()?.errorText;
      const line = `${request.method()} ${request.url()} ${error}`;
      capture.network.push(line);
      const expected = capture.navigating && new URL(request.url()).pathname === "/api/realtime"
        && error === "net::ERR_ABORTED";
      if (!expected) capture.errors.push(line);
    });
    try {
      await runTest(capture);
    } finally {
      const slug = `le-point-${info.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
      try {
        if (info.status !== info.expectedStatus || capture.errors.length > 0) {
          await writeAuditScreenshot(`audit/screenshots/${slug}-failure.png`,
            (path) => page.screenshot({ path, caret: "initial" }));
        }
      } finally {
        await writeAuditText(`audit/console/${slug}.log`, capture.console.join("\n") + "\n");
        await writeAuditText(`audit/network/${slug}.log`, capture.network.join("\n") + "\n");
      }
      expect(capture.errors, "No browser errors, write requests or Server Actions").toEqual([]);
    }
  }, { auto: true }],
});
test.use({ storageState: ".playwright/.auth/reader.json", viewport: DESKTOP });
test.setTimeout(60_000);

async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  for (let count = 0; count < 80; count++) {
    if (await target.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(target, "Reachable by Tab without mouse or programmatic focus").toBeFocused();
}

async function shot(page: Page, name: string) {
  await writeAuditScreenshot(`audit/screenshots/le-point-${name}.png`,
    (path) => page.screenshot({ path, fullPage: true, caret: "initial" }));
}

async function open(page: Page) {
  await page.goto("/le-point");
  await expect(page.getByRole("heading", { level: 1, name: "Le point", exact: true })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Données de démonstration");
  await expect(page.getByRole("note")).toContainText("rien n’est enregistré");
  await expect(page.getByRole("radio", { name: "Développement", exact: true })).toBeChecked();
  await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveText([
    "À reprendre maintenant", "Ce qui t’empêche d’avancer", "Ensuite", "Depuis ta dernière visite",
  ]);
}

async function selectProductByKeyboard(page: Page) {
  const selector = page.getByRole("radiogroup", { name: "Perspective", exact: true });
  await tabTo(page, selector.getByRole("radio", { name: "Développement", exact: true }));
  await page.keyboard.press("ArrowRight");
  await expect(selector.getByRole("radio", { name: "Produit", exact: true })).toBeChecked();
  await expect(selector.getByRole("radio", { name: "Produit", exact: true })).toBeFocused();
  await expect(page.getByRole("heading", { name: "Décisions qui t’attendent", exact: true })).toBeVisible();
}

test("keyboard journey remembers the perspective and restores focus after closing a ticket", async ({ page, audit }) => {
  await open(page);
  await shot(page, "developer-1440");
  await selectProductByKeyboard(page);
  await shot(page, "product-1440");
  audit.navigating = true;
  try {
    await page.reload();
    await expect(page.getByRole("radio", { name: "Produit", exact: true })).toBeChecked();
    await expect(page.getByRole("heading", { name: "Décisions qui t’attendent", exact: true })).toBeVisible();
  } finally {
    audit.navigating = false;
  }
  const opener = page.getByRole("button", { name: /^Ouvrir DEMO-31 —/ });
  await tabTo(page, opener);
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: /^DEMO-31 —/ });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Démonstration · lecture seule");
  await expect(panel).toContainText("@Inès Garnier, il faut choisir le format avant de finir DEMO-15.");
  await shot(page, "panel-1440");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { includeHidden: true })).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("390px keeps both perspectives in one column with complete card text and no overflow", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page);
  for (const perspective of ["developer", "product"] as const) {
    const main = page.getByRole("main");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const boxes = await main.locator("section[aria-labelledby]").evaluateAll((sections) =>
      sections.map((section) => {
        const { x, y, width, height } = section.getBoundingClientRect();
        return { x, y, width, height };
      }));
    expect(boxes).toHaveLength(4);
    for (let index = 1; index < boxes.length; index++) {
      expect(boxes[index]!.x).toBeCloseTo(boxes[0]!.x, 0);
      expect(boxes[index]!.width).toBeCloseTo(boxes[0]!.width, 0);
      expect(boxes[index]!.y).toBeGreaterThanOrEqual(boxes[index - 1]!.y + boxes[index - 1]!.height);
    }
    const clipped = await main.locator("section li p").evaluateAll((paragraphs) => paragraphs.flatMap((element) => {
      const node = element as HTMLElement;
      const style = getComputedStyle(node);
      const hidden = style.textOverflow === "ellipsis" || style.webkitLineClamp !== "none"
        || node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight;
      return hidden ? [node.textContent] : [];
    }));
    expect(clipped, "Card text is neither clipped nor truncated").toEqual([]);
    await shot(page, `${perspective}-390`);
    if (perspective === "developer") await selectProductByKeyboard(page);
  }
  const opener = page.getByRole("button", { name: /^Ouvrir DEMO-31 —/ });
  await tabTo(page, opener);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /^DEMO-31 —/ })).toBeVisible();
  await shot(page, "panel-390");
});
