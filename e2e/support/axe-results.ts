import type AxeBuilder from "@axe-core/playwright";
import { createAuditEvidenceFilters } from "./evidence";

export type AxeScan = Pick<Awaited<ReturnType<AxeBuilder["analyze"]>>, "violations">;
const IMPACT_ORDER: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

/** Allowlisted evidence only: node HTML and check payloads can contain user data. */
export function formatAxeViolations(results: AxeScan): string {
  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? null,
    description: violation.description,
    helpUrl: violation.helpUrl,
    tags: violation.tags,
    nodes: violation.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary })),
  }));
  violations.sort((a, b) =>
    (IMPACT_ORDER[a.impact ?? ""] ?? 4) - (IMPACT_ORDER[b.impact ?? ""] ?? 4)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return `${JSON.stringify(violations, null, 2)}\n`;
}

/** Reject without echoing payloads; password resolution must match global.setup.ts. */
export function assertAxeEvidenceSafe(evidence: string, fixturePassword: string | undefined): void {
  const password = fixturePassword ?? "Audit-Local-2026!";
  if (createAuditEvidenceFilters(password).credentialEvidence.test(evidence)) {
    throw new Error("Credentials refused in axe evidence.");
  }
}
