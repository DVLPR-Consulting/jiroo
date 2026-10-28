import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { writeAuditText } from "../audit-artifacts";
import { assertAxeEvidenceSafe, formatAxeViolations } from "./axe-results";

export { formatAxeViolations } from "./axe-results";

export async function auditAccessibility(page: Page, pageName: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const evidence = formatAxeViolations(results);
  assertAxeEvidenceSafe(evidence, process.env.JIROO_PLAYWRIGHT_PASSWORD);
  await writeAuditText(`audit/a11y/axe-${pageName}.json`, evidence);
  return results.violations;
}
