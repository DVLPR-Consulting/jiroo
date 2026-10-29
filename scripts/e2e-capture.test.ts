import { EventEmitter } from "node:events";
import type { Page, Request, Response } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { observePage, type CaptureFault } from "../e2e/support/capture";

function setup(actor = "reader") {
  const events = new EventEmitter();
  const page = events as unknown as Page;
  const faults: CaptureFault[] = [];
  const capture = { console: [] as string[], network: [] as string[], onFault: (fault: CaptureFault) => faults.push(fault) };
  observePage(page, capture, actor);
  return { events, page, capture, faults };
}
function request(input: { method?: string; headers?: Record<string, string | undefined>; error?: string; url?: string } = {}) {
  return {
    method: () => input.method ?? "POST",
    headers: () => input.headers ?? { "next-action": "private-action-id", authorization: "private-header" },
    failure: () => ({ errorText: input.error ?? "net::ERR_ABORTED" }),
    url: () => input.url ?? "http://localhost:3100/b/CASS?private=query",
    postData: () => { throw new Error("Capture must never read the request body."); },
  } as unknown as Request;
}
function respond(events: EventEmitter, req: Request, status: number) {
  events.emit("response", { request: () => req, status: () => status, url: () => req.url() } as Response);
}

describe("bounded browser capture", () => {
  it.each([
    { name: "an action with an already received 200", method: "POST", headers: { "next-action": "private-action-id" }, status: 200, error: "net::ERR_ABORTED", diagnostic: "[reader] [aborted-action] POST /b/CASS 200" },
    { name: "an obsolete RSC GET", method: "GET", headers: { rsc: "1" }, status: undefined, error: "net::ERR_ABORTED", diagnostic: "[reader] [aborted-rsc] GET /b/CASS" },
    { name: "a GET without RSC", method: "GET", headers: {}, status: 200, error: "net::ERR_ABORTED", diagnostic: null },
    { name: "an action with no response", method: "POST", headers: { "next-action": "private-action-id" }, status: undefined, error: "net::ERR_ABORTED", diagnostic: null },
    { name: "a POST without Next-Action", method: "POST", headers: {}, status: 200, error: "net::ERR_ABORTED", diagnostic: null },
    { name: "an injected network fault", method: "POST", headers: { "next-action": "private-action-id" }, status: 200, error: "net::ERR_FAILED", diagnostic: null },
    { name: "an action with a non-200 response", method: "POST", headers: { "next-action": "private-action-id" }, status: 201, error: "net::ERR_ABORTED", diagnostic: null },
    { name: "a realtime URL without RSC", method: "GET", headers: {}, status: undefined, error: "net::ERR_ABORTED", diagnostic: null, url: "http://localhost:3100/api/realtime" },
  ])("classifies $name without widening the evidence policy", (input) => {
    const { events, capture, faults } = setup();
    const req = request(input);
    if (input.status !== undefined) respond(events, req, input.status);
    events.emit("requestfailed", req);
    if (input.diagnostic) {
      expect(capture.console).toEqual([input.diagnostic]);
      expect(faults).toEqual([]);
      expect(capture.console.join("\n")).not.toMatch(/private|authorization|next-action|query/);
    } else {
      expect(capture.console).toEqual([]);
      expect(faults.map((fault) => fault.kind)).toEqual(["request"]);
      expect(faults[0]!.line).toContain(input.error);
    }
    expect(capture.network.at(-1)).toContain(input.error);
  });

  it("remembers a status by request identity, not by URL or another page", () => {
    const first = setup("first"), second = setup("second");
    const received = request(), pending = request();
    respond(first.events, received, 200);
    first.events.emit("requestfailed", pending);
    second.events.emit("requestfailed", received);
    first.events.emit("requestfailed", received);
    expect(first.faults.map((fault) => fault.kind)).toEqual(["request"]);
    expect(second.faults.map((fault) => fault.kind)).toEqual(["request"]);
    expect(first.capture.console).toEqual(["[first] [aborted-action] POST /b/CASS 200"]);
    expect(second.capture.console).toEqual([]);
  });

  it("retains console/page errors and HTTP errors while recording ordinary traffic", () => {
    const { events, page, capture, faults } = setup();
    const req = request();
    events.emit("request", req);
    events.emit("console", { type: () => "warning", text: () => "a warning" });
    events.emit("console", { type: () => "error", text: () => "a console error" });
    events.emit("pageerror", new Error("a page error"));
    respond(events, req, 503);
    expect(capture.console).toEqual(["[reader] warning: a warning", "[reader] error: a console error", "[reader] pageerror: a page error"]);
    expect(faults.map((fault) => fault.kind)).toEqual(["console", "page", "http"]);
    expect(faults.every((fault) => fault.page === page)).toBe(true);
    expect(capture.network).toEqual(["[reader] request POST http://localhost:3100/b/CASS?private=query", "[reader] 503 POST http://localhost:3100/b/CASS?private=query"]);
    expect(capture.network.join("\n")).not.toContain("private-header");
  });
});
