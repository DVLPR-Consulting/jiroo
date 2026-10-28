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

export type ExpectedFaultWindow = {
  start: number;
  end?: number;
  marker: string;
  /** Exact message captured from the deliberately failing read, never a pattern. */
  serverRenderingError?: string;
};

type ExpectedFaultCapture = {
  console: string[];
  faults: string[];
  expectedFault?: ExpectedFaultWindow;
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
  const boundary = inWindow.filter((fault) => fault.includes(BOUNDARY_FAULT));
  if (boundary.length === 0) {
    throw new Error("La panne injectée doit produire une preuve navigateur.");
  }
  const expected = inWindow.filter((fault) => {
    if (fault.includes(BOUNDARY_FAULT)) return true;
    if (!window.serverRenderingError) return false;
    const prefix = fault.match(/^\[[^\]\r\n]+\] pageerror: Switched to client rendering because the server rendering errored:\n\n/u);
    return prefix !== null && fault.slice(prefix[0].length) === window.serverRenderingError;
  });
  // Internal table names are allowed here, but credentials must never be dropped.
  for (const fault of expected) {
    if (credentialEvidence.test(fault)) {
      throw new Error("Identifiants refusés dans une erreur attendue avant assainissement.");
    }
  }
  const preceding = new Map<string, number>();
  const remaining = new Map<string, number>();
  for (const fault of expected) remaining.set(fault, (remaining.get(fault) ?? 0) + 1);
  for (const fault of capture.faults.slice(0, window.start)) {
    if (remaining.has(fault)) preceding.set(fault, (preceding.get(fault) ?? 0) + 1);
  }
  const consoleLines = capture.console.filter((line) => {
    const skip = preceding.get(line) ?? 0;
    if (skip > 0) {
      preceding.set(line, skip - 1);
      return true;
    }
    const remove = remaining.get(line) ?? 0;
    if (remove === 0) return true;
    remaining.set(line, remove - 1);
    return false;
  });
  capture.faults = [
    ...capture.faults.slice(0, window.start),
    ...inWindow.filter((fault) => !expected.includes(fault)),
    ...capture.faults.slice(end),
  ];
  capture.console = consoleLines;
  capture.console.push(window.marker);
  capture.expectedFault = undefined;
}

export function classifyRequestFailure(input: {
  method: string;
  errorText?: string;
  nextAction?: string;
  rsc?: string;
  responseStatus?: number;
}): "aborted-action" | "aborted-rsc" | "fault" {
  if (input.errorText !== "net::ERR_ABORTED") return "fault";
  if (input.method === "GET" && input.rsc?.trim()) return "aborted-rsc";
  return input.method === "POST"
    && input.errorText === "net::ERR_ABORTED"
    && !!input.nextAction?.trim()
    && input.responseStatus === 200
    ? "aborted-action"
    : "fault";
}
