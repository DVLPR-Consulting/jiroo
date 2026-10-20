import { describe, expect, it } from "vitest";
import { assertDemoSeedAllowed } from "./seed-demo-le-point";

const allowed = { JIROO_ALLOW_DEMO_SEED: "1", DATABASE_URL: "postgresql://local:local@127.0.0.1:5434/demo" };

describe("demo seed safety", () => {
  it("requires explicit opt-in even for a local database", () => {
    expect(() => assertDemoSeedAllowed({ ...allowed, JIROO_ALLOW_DEMO_SEED: undefined })).toThrow(/JIROO_ALLOW_DEMO_SEED/);
  });
  it.each([undefined, "", "not a URL", "postgresql://secret:private@remote.example/demo", "https://localhost/demo", "postgresql://localhost"])("refuses a missing, remote or ambiguous connection without leaking credentials (%s)", (DATABASE_URL) => {
    expect(() => assertDemoSeedAllowed({ ...allowed, DATABASE_URL })).toThrow(/local PostgreSQL/);
    try { assertDemoSeedAllowed({ ...allowed, DATABASE_URL }); } catch (error) {
      expect(String(error)).not.toContain("secret:private");
    }
  });
  it.each(["host=remote.example", "hostaddr=192.0.2.1", "port=5433", "service=other"])("refuses routing overrides that can change the checked target (%s)", (query) => {
    expect(() => assertDemoSeedAllowed({ ...allowed, DATABASE_URL: allowed.DATABASE_URL + "?" + query })).toThrow(/routing override/);
  });
  it.each(["127.0.0.1", "localhost"])("accepts an explicit opted-in database on %s", (host) => {
    expect(() => assertDemoSeedAllowed({ ...allowed, DATABASE_URL: `postgresql://local:local@${host}:5434/demo?sslmode=disable` })).not.toThrow();
  });
});
