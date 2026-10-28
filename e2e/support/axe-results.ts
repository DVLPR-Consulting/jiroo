import type AxeBuilder from "@axe-core/playwright";

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
