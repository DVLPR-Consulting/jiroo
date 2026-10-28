// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createAuditEvidenceFilters, settleExpectedFault } from "../e2e/support/evidence";

const PASSWORD = "Synthetic.[password]+2026!";
const BOUNDARY = "handled by the <ErrorBoundaryHandler> error boundary";
const BENIGN = `${BOUNDARY}: select * from sprint_report_snapshots`;
const { credentialEvidence, forbiddenAuditEvidence } = createAuditEvidenceFilters(PASSWORD);

function captureWith(line: string) {
  return {
    console: ["before", BENIGN, line, "unrelated", "after"],
    faults: ["before", BENIGN, line, "unrelated", "after"],
    expectedFault: { start: 1, end: 4, marker: "[expected-fault] synthetic read failure" },
  };
}

describe("expected fault evidence", () => {
  it.each(["cookie: session=synthetic-session", "set-cookie: session=synthetic-session"])(
    "rejects %s before removing any expected fault",
    (header) => {
      const capture = captureWith(`${BOUNDARY}: ${header}`);
      const before = structuredClone(capture);

      expect(() => settleExpectedFault(capture, credentialEvidence))
        .toThrow("Identifiants refusés dans une erreur attendue avant assainissement.");
      expect(capture).toEqual(before);
    },
  );

  it("removes benign boundary lines while retaining faults outside and inside the window", () => {
    const capture = captureWith(`${BOUNDARY}: synthetic read failure`);

    settleExpectedFault(capture, credentialEvidence);

    expect(capture.faults).toEqual(["before", "unrelated", "after"]);
    expect(capture.console).toEqual([
      "before", "unrelated", "after", "[expected-fault] synthetic read failure",
    ]);
    expect(capture.expectedFault).toBeUndefined();
  });

  it("covers late boundary lines when the window has no explicit end", () => {
    const capture = { console: [BENIGN], faults: [BENIGN], expectedFault: { start: 0, marker: "expected" } };
    settleExpectedFault(capture, credentialEvidence);
    expect(capture.faults).toEqual([]);
    expect(capture.console).toEqual(["expected"]);
  });

  it("does nothing without an expected fault window", () => {
    const capture = { console: [BENIGN], faults: [BENIGN] };
    settleExpectedFault(capture, credentialEvidence);
    expect(capture).toEqual({ console: [BENIGN], faults: [BENIGN] });
  });

  it("fails without a boundary line inside the window, without changing the evidence", () => {
    const capture = { console: [BENIGN], faults: [BENIGN, "unrelated"], expectedFault: { start: 1, marker: "expected" } };
    const before = structuredClone(capture);
    expect(() => settleExpectedFault(capture, credentialEvidence)).toThrow();
    expect(capture).toEqual(before);
  });
});

describe("shared credential filters", () => {
  it.each([
    "postgres://synthetic:password@localhost/test",
    "postgresql://synthetic:password@localhost/test",
    "Authorization: synthetic",
    "Bearer synthetic-token",
    "Cookie: session=synthetic-session",
    "Set-Cookie: session=synthetic-session",
    "jiroo-e2e-secret",
    "DATABASE_URL",
    "DIRECT_DATABASE_URL",
    PASSWORD,
  ])("rejects %s in both filters and before sanitization", (credential) => {
    expect(credentialEvidence.test(credential)).toBe(true);
    expect(forbiddenAuditEvidence.test(credential)).toBe(true);
    const capture = captureWith(`${BOUNDARY}: ${credential}`);
    const before = structuredClone(capture);
    expect(() => settleExpectedFault(capture, credentialEvidence)).toThrow();
    expect(capture).toEqual(before);
  });

  it.each(["select ", "sprint_report_snapshots"])(
    "keeps %s forbidden only in persisted evidence", (internal) => {
      expect(credentialEvidence.test(internal)).toBe(false);
      expect(forbiddenAuditEvidence.test(internal)).toBe(true);
    },
  );

  it("matches the fixture password literally", () => {
    expect(credentialEvidence.test("SyntheticXpassworddddd2026!")).toBe(false);
    expect(forbiddenAuditEvidence.test("SyntheticXpassworddddd2026!")).toBe(false);
  });
});
