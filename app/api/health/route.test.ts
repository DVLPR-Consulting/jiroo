import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/db/health", () => ({ healthDb: { execute: mocks.execute } }));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("checks the database without a session and returns only uncached health", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ value: 1 }] });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]![0]);
    expect(query.sql).toBe("select 1");
    expect(query.params).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns an opaque uncached 503 when the database rejects the query", async () => {
    mocks.execute.mockRejectedValue(new Error("password=private host=internal-db PostgreSQL 17"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "unavailable" });
  });

  it("responds within two seconds even when the database never settles", async () => {
    mocks.execute.mockReturnValue(new Promise(() => {}));
    let settled = false;
    const pending = GET().then((response) => {
      settled = true;
      return response;
    });

    await vi.advanceTimersByTimeAsync(1999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});
