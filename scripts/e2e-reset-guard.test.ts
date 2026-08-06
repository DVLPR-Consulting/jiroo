import { describe, expect, it, vi } from "vitest";
import * as e2eResetGuard from "./e2e-reset-guard";
import { assertE2eResetAllowed } from "./e2e-reset-guard";

const LOCAL_DATABASE_URL = "postgres://jiroo:jiroo@localhost:5433/jiroo_e2e";

describe("assertE2eResetAllowed", () => {
  it("expose une garde d’identité PostgreSQL effective", () => {
    expect(typeof e2eResetGuard.assertE2eDatabaseIdentity).toBe("function");
  });

  it("refuse une identité PostgreSQL attendue absente", () => {
    expect(() => e2eResetGuard.assertE2eDatabaseIdentity({
      databaseName: "jiroo_e2e",
      expectedSystemIdentifier: undefined,
      systemIdentifier: "1234567890123456789",
    })).toThrow("JIROO_E2E_DATABASE_SYSTEM_IDENTIFIER");
  });

  it("refuse un nom de base effectif différent de jiroo_e2e", () => {
    expect(() => e2eResetGuard.assertE2eDatabaseIdentity({
      databaseName: "jiroo",
      expectedSystemIdentifier: "1234567890123456789",
      systemIdentifier: "1234567890123456789",
    })).toThrow("base PostgreSQL effective");
  });

  it("refuse une identité PostgreSQL divergente", () => {
    expect(() => e2eResetGuard.assertE2eDatabaseIdentity({
      databaseName: "jiroo_e2e",
      expectedSystemIdentifier: "9876543210987654321",
      systemIdentifier: "1234567890123456789",
    })).toThrow("identité PostgreSQL effective");
  });

  it("retourne uniquement l’empreinte de l’identité PostgreSQL vérifiée", () => {
    const rawIdentifier = "1234567890123456789";
    const verified = e2eResetGuard.assertE2eDatabaseIdentity({
      databaseName: "jiroo_e2e",
      expectedSystemIdentifier: rawIdentifier,
      systemIdentifier: rawIdentifier,
    });

    expect(verified).toEqual({
      databaseName: "jiroo_e2e",
      systemIdentifierFingerprint: "sha256:22085aa929bcd7af4b23d9d9c046a1d4fde8be51f79d91392efafef96574ab01",
    });
    expect(JSON.stringify(verified)).not.toContain(rawIdentifier);
  });

  it("lit le nom et l’identité effectifs depuis la connexion qui sera réinitialisée", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ databaseName: "jiroo_e2e", systemIdentifier: "1234567890123456789" }],
    });

    await expect(e2eResetGuard.verifyE2eDatabaseIdentity(
      { query },
      "1234567890123456789",
    )).resolves.toEqual({
      databaseName: "jiroo_e2e",
      systemIdentifierFingerprint: "sha256:22085aa929bcd7af4b23d9d9c046a1d4fde8be51f79d91392efafef96574ab01",
    });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("pg_control_system()");
    expect(query.mock.calls[0]?.[0]).toContain("current_database()");
  });

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
    "postgres://jiroo:jiroo@localhost:5433/jiroo",
    "postgres://jiroo:jiroo@localhost:5433/jiroo_test",
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
      databaseName: "jiroo_e2e",
      hostname: "localhost",
    });
  });

  it.each([
    "postgresql://jiroo:jiroo@127.0.0.1:5432/jiroo_e2e",
    "postgres://jiroo:jiroo@[::1]:5432/jiroo_e2e",
  ])("autorise uniquement une base locale explicitement nommée %s", (databaseUrl) => {
    expect(assertE2eResetAllowed({ allowReset: "1", databaseUrl })).toEqual({
      databaseName: new URL(databaseUrl).pathname.slice(1),
      hostname: new URL(databaseUrl).hostname.replace(/^\[|\]$/gu, ""),
    });
  });
});
