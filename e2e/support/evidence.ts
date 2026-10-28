const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export function createAuditEvidenceFilters(fixturePassword: string) {
  const credentials = [
    "postgres(?:ql)?:",
    "authorization",
    "bearer",
    "cookie:", // Also matches Set-Cookie headers.
    "database_url",
    "direct_database_url",
    "jiroo-e2e-secret",
    escapeRegExp(fixturePassword),
  ];
  return {
    credentialEvidence: new RegExp(credentials.join("|"), "i"),
    forbiddenAuditEvidence: new RegExp([
      ...credentials,
      "select\\s",
      "sprint_report_snapshots",
    ].join("|"), "i"),
  };
}

type ExpectedFaultCapture = {
  console: string[];
  faults: string[];
  expectedFault?: { start: number; end?: number; marker: string };
};

const BOUNDARY_FAULT = "handled by the <ErrorBoundaryHandler> error boundary";

/**
 * Validates every deliberate boundary line before replacing them with one marker.
 * Unrelated faults inside or outside the window remain faults.
 */
export function settleExpectedFault(capture: ExpectedFaultCapture, credentialEvidence: RegExp) {
  const window = capture.expectedFault;
  if (!window) return;
  const end = window.end ?? capture.faults.length;
  const inWindow = capture.faults.slice(window.start, end);
  const expected = inWindow.filter((fault) => fault.includes(BOUNDARY_FAULT));
  if (expected.length === 0) {
    throw new Error("La panne injectée doit produire une preuve navigateur.");
  }
  // Internal table names are allowed here, but credentials must never be dropped.
  for (const fault of expected) {
    if (credentialEvidence.test(fault)) {
      throw new Error("Identifiants refusés dans une erreur attendue avant assainissement.");
    }
  }
  capture.faults = [
    ...capture.faults.slice(0, window.start),
    ...inWindow.filter((fault) => !expected.includes(fault)),
    ...capture.faults.slice(end),
  ];
  capture.console = capture.console.filter((line) => !expected.includes(line));
  capture.console.push(window.marker);
  capture.expectedFault = undefined;
}
