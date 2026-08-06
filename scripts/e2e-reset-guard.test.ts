import { describe, expect, it } from "vitest";
import { assertE2eResetAllowed } from "./e2e-reset-guard";

const LOCAL_DATABASE_URL = "postgres://jiroo:jiroo@localhost:5433/jiroo";

describe("assertE2eResetAllowed", () => {
  it("refuse le reset sans consentement explicite", () => {
    expect(() => assertE2eResetAllowed({
      allowReset: undefined,
      databaseUrl: LOCAL_DATABASE_URL,
    })).toThrow("JIROO_ALLOW_E2E_RESET=1");
  });

  it("refuse une base distante même avec consentement", () => {
    expect(() => assertE2eResetAllowed({
      allowReset: "1",
      databaseUrl: "postgres://jiroo:secret@db.example.com:5432/jiroo",
    })).toThrow("hôte PostgreSQL local");
  });

  it.each([
    "postgres://jiroo:jiroo@localhost:5433/postgres",
    "postgres://jiroo:jiroo@127.0.0.1:5433/production",
  ])("refuse le nom de base non autorisé %s", (databaseUrl) => {
    expect(() => assertE2eResetAllowed({
      allowReset: "1",
      databaseUrl,
    })).toThrow("base PostgreSQL E2E autorisée");
  });

  it.each([
    "postgres://jiroo:jiroo@localhost:5433/jiroo",
    "postgresql://jiroo:jiroo@127.0.0.1:5432/jiroo_e2e",
    "postgres://jiroo:jiroo@[::1]:5432/jiroo_test",
  ])("autorise uniquement une base locale explicitement nommée %s", (databaseUrl) => {
    expect(assertE2eResetAllowed({ allowReset: "1", databaseUrl })).toEqual({
      databaseName: new URL(databaseUrl).pathname.slice(1),
      hostname: new URL(databaseUrl).hostname.replace(/^\[|\]$/gu, ""),
    });
  });
});
