// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classifyRequestFailure, createAuditEvidenceFilters, settleExpectedFault } from "../e2e/support/evidence";

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

const READ_FAILURE = 'Failed query: select "sequence" from "sprint_events" where "sprint_id" = $1\nparams: synthetic-sprint';
const renderingFault = (message = READ_FAILURE) =>
  `[admin] pageerror: Switched to client rendering because the server rendering errored:\n\n${message}`;

function captureRenderingFault(message = READ_FAILURE) {
  return {
    console: ["before", BENIGN, renderingFault(message), renderingFault(message), "after"],
    faults: ["before", BENIGN, renderingFault(message), renderingFault(message), "after"],
    expectedFault: { start: 1, end: 4, marker: "expected", serverRenderingError: message },
  };
}

describe("identified server-rendering fallback during an injected read fault", () => {
  it("removes both fallback pageerrors matching the captured read error, along with the boundary", () => {
    const capture = captureRenderingFault();
    settleExpectedFault(capture, credentialEvidence);
    expect(capture.console).toEqual(["before", "after", "expected"]);
    expect(capture.faults).toEqual(["before", "after"]);
  });

  it("retains the same pageerror outside the declared fault window", () => {
    const capture = captureRenderingFault();
    capture.faults.push(renderingFault());
    capture.console.push(renderingFault());
    settleExpectedFault(capture, credentialEvidence);
    expect(capture.faults).toEqual(["before", "after", renderingFault()]);
    expect(capture.console).toEqual(["before", "after", renderingFault(), "expected"]);
  });

  it("preserves identical pageerrors before and after the window in their original positions", () => {
    const lines = [renderingFault(), "before window", BENIGN, renderingFault(), "after window", renderingFault()];
    const capture = {
      console: [...lines], faults: [...lines],
      expectedFault: { start: 2, end: 4, marker: "expected", serverRenderingError: READ_FAILURE },
    };
    settleExpectedFault(capture, credentialEvidence);
    expect(capture.console).toEqual([renderingFault(), "before window", "after window", renderingFault(), "expected"]);
    expect(capture.faults).toEqual([renderingFault(), "before window", "after window", renderingFault()]);
  });

  it.each([
    renderingFault(`${READ_FAILURE}-different-sprint`),
    `[admin] pageerror: ${READ_FAILURE}`,
    `[admin] error: ${READ_FAILURE}`,
  ])("keeps an unrelated error: %s", (fault) => {
    const capture = captureRenderingFault();
    capture.faults[2] = fault;
    capture.console[2] = fault;
    settleExpectedFault(capture, credentialEvidence);
    expect(capture.faults).toEqual(["before", fault, "after"]);
    expect(forbiddenAuditEvidence.test(capture.console.join("\n"))).toBe(true);
  });

  it("keeps server-rendering errors when no precise read error was declared", () => {
    const capture = captureWith(renderingFault());
    settleExpectedFault(capture, credentialEvidence);
    expect(capture.faults).toEqual(["before", renderingFault(), "unrelated", "after"]);
    expect(forbiddenAuditEvidence.test(capture.console.join("\n"))).toBe(true);
  });

  it("still requires a boundary proof inside the window", () => {
    const capture = captureRenderingFault();
    capture.console[1] = "unrelated";
    capture.faults[1] = "unrelated";
    const before = structuredClone(capture);
    expect(() => settleExpectedFault(capture, credentialEvidence)).toThrow();
    expect(capture).toEqual(before);
  });

  it.each(["Cookie: synthetic", "Set-Cookie: synthetic", "Bearer synthetic", PASSWORD])(
    "rejects a precisely matching fallback carrying %s before sanitization", (secret) => {
      const capture = captureRenderingFault(`${READ_FAILURE}\n${secret}`);
      const before = structuredClone(capture);
      expect(() => settleExpectedFault(capture, credentialEvidence)).toThrow();
      expect(capture).toEqual(before);
    },
  );
});

describe("abandoned Next action classification", () => {
  const action = { method: "POST", errorText: "net::ERR_ABORTED", nextAction: "synthetic-action", responseStatus: 200 };
  it("marks an abandoned Next POST with a received success response as diagnostic", () => {
    expect(classifyRequestFailure(action)).toBe("aborted-action");
  });
  it.each([
    { ...action, method: "GET" },
    { ...action, responseStatus: undefined },
    { ...action, errorText: "net::ERR_CONNECTION_RESET" },
    { ...action, nextAction: undefined },
    { ...action, nextAction: "" },
    { ...action, responseStatus: 500 },
  ])("keeps a failure outside the acknowledged-action case: %j", (input) => {
    expect(classifyRequestFailure(input)).toBe("fault");
  });
});


describe("abandoned RSC request classification", () => {
  it.each([200, undefined])("marks an aborted RSC GET as diagnostic (status=%s)", (responseStatus) => {
    expect(classifyRequestFailure({ method: "GET", rsc: "1", errorText: "net::ERR_ABORTED", responseStatus }))
      .toBe("aborted-rsc");
  });
  it.each([
    { method: "GET", errorText: "net::ERR_ABORTED" },
    { method: "GET", rsc: "", errorText: "net::ERR_ABORTED" },
    { method: "GET", rsc: "1", errorText: "net::ERR_CONNECTION_RESET" },
    { method: "POST", rsc: "1", errorText: "net::ERR_ABORTED", responseStatus: 200 },
  ])("keeps failures outside the RSC case: %j", (input) => {
    expect(classifyRequestFailure(input)).toBe("fault");
  });
});
