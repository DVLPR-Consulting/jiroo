import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { writeAuditText } from "../audit-artifacts";
import { formatAxeViolations } from "./axe-results";
import { createAuditEvidenceFilters } from "./evidence";

export { formatAxeViolations } from "./axe-results";

export async function auditAccessibility(page: Page, pageName: string) {
  const password = process.env.JIROO_PLAYWRIGHT_PASSWORD;
  if (!password) throw new Error("The isolated E2E fixture password is required for evidence checks.");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const evidence = formatAxeViolations(results);
  const { credentialEvidence } = createAuditEvidenceFilters(password);
  if (credentialEvidence.test(evidence)) throw new Error("Credentials refused in axe evidence.");
  await writeAuditText(`audit/a11y/axe-${pageName}.json`, evidence);
  return results.violations;
}
