import { expect, test } from "@playwright/test";
import { auditAccessibility } from "../support/axe";
import { AUDIT_PAGES, openAuditPage } from "./pages";

test.use({ storageState: ".playwright/.auth/platform-admin.json" });

for (const target of AUDIT_PAGES) {
  test(`WCAG A/AA — ${target.name}`, async ({ page }, testInfo) => {
    await openAuditPage(page, target);
    const violations = await auditAccessibility(page, target.name);
    const serious = violations.filter(({ impact }) => impact === "critical" || impact === "serious");
    const moderate = violations.filter(({ impact }) => impact === "moderate").length;
    const minor = violations.filter(({ impact }) => impact === "minor").length;
    const counts = `${serious.length} critical/serious, ${moderate} moderate, ${minor} minor`;
    testInfo.annotations.push({ type: "axe", description: counts });
    // Never put raw node HTML into assertion messages or reports.
    expect(serious.map(({ id, impact }) => ({ id, impact })), counts).toEqual([]);
  });
}
