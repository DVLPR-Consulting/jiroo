import { describe, expect, it, vi } from "vitest";
import type { Page, Request, Response, Route } from "@playwright/test";
import { awaitAction, interceptAction, matchesAction, performAction, readActionArguments } from "../e2e/support/actions";

// A permission read must never satisfy the wait for a mutation.
const mutation = (input: Record<string, unknown>) => input.id === "item-1" && input.estimatePoints === 0;

describe("Next-Action argument correlation", () => {
  it("reads JSON arguments without changing zero, null or nested values", () => {
    expect(readActionArguments('[{"id":"item-1","estimatePoints":0,"parentId":null,"ids":["a","b"]}]'))
      .toEqual([{ id: "item-1", estimatePoints: 0, parentId: null, ids: ["a", "b"] }]);
  });

  it.each([null, "", "not-json", '{"id":"item-1"}', "null", "true", '[] trailing'])
    ("refuses malformed or non-array bodies without printing their contents", (body) => {
      const log = vi.spyOn(console, "log");
      const error = vi.spyOn(console, "error");
      try {
        expect(readActionArguments(body)).toBeNull();
        expect(log).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
      } finally { log.mockRestore(); error.mockRestore(); }
    });

  it("matches a single object by identity and value", () => {
    expect(matchesAction([{ id: "item-1", estimatePoints: 0 }], mutation)).toBe(true);
    expect(matchesAction([{ id: "item-2", estimatePoints: 0 }], mutation)).toBe(false);
    expect(matchesAction([{ id: "item-1", estimatePoints: null }], mutation)).toBe(false);
  });

  it.each([null, [], ["backlog-1"], [null], [[{ id: "item-1" }]],
    [{ id: "item-1", estimatePoints: 0 }, { id: "item-1", estimatePoints: 0 }],
    [{ id: "item-1", estimatePoints: 0 }, "extra"]].map((args) => ({ args })))
    ("refuses ambiguous arguments and permission reads", ({ args }) => {
      expect(matchesAction(args, mutation)).toBe(false);
    });
});

function request(body: string, method = "POST", nextAction = "action-id") {
  return { method: () => method, headers: () => nextAction ? { "next-action": nextAction } : {}, postData: () => body } as Request;
}
function response(req: Request, status = 200) {
  return { request: () => req, status: () => status,
    finished: () => { throw new Error("The Flight stream must not be awaited."); } } as unknown as Response;
}

it("selects the mutation response, excluding reads, GETs and ordinary POSTs", async () => {
  const candidates = [response(request('["backlog-1"]')), response(request('[{"id":"item-1","estimatePoints":0}]', "GET")),
    response(request('[{"id":"item-1","estimatePoints":0}]', "POST", "")),
    response(request('[{"id":"item-1","estimatePoints":0}]'), 201)];
  const page = { waitForResponse: async (predicate: (r: Response) => boolean) => candidates.find(predicate)! } as unknown as Page;
  expect(await awaitAction(page, { match: mutation })).toEqual({ status: 201, args: [{ id: "item-1", estimatePoints: 0 }] });
});

it("arms correlation before the action and keeps timing outside the Flight stream", async () => {
  let subscribed = false;
  let deliver: ((response: Response) => void) | undefined;
  const page = { waitForResponse: () => { subscribed = true; return new Promise<Response>((resolve) => { deliver = resolve; }); } } as unknown as Page;
  const result = await performAction(page, mutation, async () => {
    expect(subscribed).toBe(true);
    deliver!(response(request('[{"id":"item-1","estimatePoints":0}]')));
  });
  expect(result.status).toBe(200);
  expect(result.args).toEqual([{ id: "item-1", estimatePoints: 0 }]);
  expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
});


it("intercepts only the first matching mutation and can remove its own route", async () => {
  let handler: ((route: Route) => Promise<void>) | undefined;
  let active = false;
  let intercepted = 0, passed = 0;
  const page = {
    route: async (_url: string, callback: typeof handler) => { handler = callback; active = true; },
    unroute: async (_url: string, callback: typeof handler) => { if (callback === handler) active = false; },
  } as unknown as Page;
  const capture = await interceptAction(page, { match: mutation, respond: async () => { intercepted++; } });
  expect(() => capture.request()).toThrow("No matching action was intercepted.");
  for (const req of [request('["backlog-1"]'), request('[{"id":"item-1","estimatePoints":0}]'), request('[{"id":"item-1","estimatePoints":0}]')]) {
    await handler!({ request: () => req, fallback: async () => { passed++; } } as unknown as Route);
  }
  expect(intercepted).toBe(1);
  expect(passed).toBe(2);
  expect(readActionArguments(capture.request().postData())).toEqual([{ id: "item-1", estimatePoints: 0 }]);
  await capture.dispose();
  expect(active).toBe(false);
});

it("keeps the transport status guard when timing a mutation", async () => {
  const page = { waitForResponse: async () => response(request('[{"id":"item-1","estimatePoints":0}]'), 500) } as unknown as Page;
  await expect(performAction(page, mutation, async () => undefined)).rejects.toThrow("HTTP 500");
});
