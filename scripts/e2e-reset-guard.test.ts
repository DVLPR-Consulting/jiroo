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
    "postgres://jiroo:jiroo@localhost:5433/jiroo?host=db.example.com",
    "postgres://jiroo:jiroo@localhost:5433/jiroo?host=%2Fvar%2Frun%2Fpostgresql",
    "postgres://jiroo:jiroo@localhost:5433/jiroo?hostaddr=203.0.113.7",
    "postgres://jiroo:jiroo@localhost:5433/jiroo?port=6543",
    "postgres://jiroo:jiroo@localhost:5433/jiroo?database=production",
    "postgres://jiroo:jiroo@localhost:5433/jiroo?dbname=production",
    "postgres://jiroo:jiroo@localhost:5433/jiroo?service=production",
    "postgres://jiroo:jiroo@localhost:5433/jiroo?servicefile=%2Ftmp%2Fpg_service.conf",
    "postgres://jiroo:jiroo@localhost:5433/jiroo?socket=%2Fvar%2Frun%2Fpostgresql",
    "postgres://jiroo:jiroo@localhost:5433/jiroo?connection_string=postgres%3A%2F%2Fu%40db.example.com%2Fjiroo",
  ])("refuse tout paramètre susceptible de rediriger PostgreSQL %s", (databaseUrl) => {
    expect(() => assertE2eResetAllowed({
      allowReset: "1",
      databaseUrl,
    })).toThrow("paramètre de destination PostgreSQL");
  });

  it("refuse les paramètres de connexion inconnus par défaut", () => {
    expect(() => assertE2eResetAllowed({
      allowReset: "1",
      databaseUrl: `${LOCAL_DATABASE_URL}?future_connection_target=db.example.com`,
    })).toThrow("paramètre PostgreSQL non autorisé");
  });

  it("conserve les paramètres TLS sans effet sur la destination", () => {
    expect(assertE2eResetAllowed({
      allowReset: "1",
      databaseUrl: `${LOCAL_DATABASE_URL}?sslmode=require&application_name=jiroo-e2e`,
    })).toEqual({
      databaseName: "jiroo",
      hostname: "localhost",
    });
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
