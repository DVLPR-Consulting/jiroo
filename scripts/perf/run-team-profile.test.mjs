// @vitest-environment node
import { describe, expect, it } from "vitest";
import { runConfig } from "./run-team-profile.mjs";

describe("owned team-profile environment", () => {
  it("ignores inherited database/auth configuration and generates an isolated loopback target", () => {
    const a = runConfig({ DATABASE_URL: "postgres://shared.neon.tech/shared", DIRECT_DATABASE_URL: "postgres://localhost:5433/shared", BETTER_AUTH_URL: "https://prod.invalid" });
    const b = runConfig({});
    expect(a.database).toMatch(/^jir41_perf_[a-f0-9]{12}$/);
    expect(a.container).toMatch(/^jiroo-team-load-[a-f0-9]{12}$/);
    expect(a.base).toBe("http://127.0.0.1:3441");
    expect(new URL(a.env.DATABASE_URL).hostname).toBe("127.0.0.1");
    expect(new URL(a.env.DATABASE_URL).port).toBe("5434");
    expect(new URL(a.env.DATABASE_URL).pathname).toBe(`/${a.database}`);
    expect(a.env.DATABASE_URL).not.toBe(b.env.DATABASE_URL);
    expect(a.env.BETTER_AUTH_URL).toBe(a.base);
    expect(a.durationMs).toBe(180000);
  });
  it("rejects invalid duration/ports before provisioning anything", () => {
    for (const value of ["0", "-1", "NaN", "241", "1.5"]) expect(() => runConfig({ PERF_SECONDS: value })).toThrow(/seconds/i);
    for (const value of ["0", "65536", "https://neon.tech", "5434"]) expect(() => runConfig({ PERF_PORT: value })).toThrow(/port/i);
  });
});
