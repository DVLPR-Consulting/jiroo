import { afterAll, describe, expect, it } from "vitest";
import { databasePool } from "../lib/db";
import {
  assertE2eResetAllowed,
  verifyE2eDatabaseIdentity,
} from "./e2e-reset-guard";

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("garde d’identité PostgreSQL E2E locale", () => {
  afterAll(async () => {
    await databasePool.end();
  });

  it("accepte l’instance explicitement attendue et refuse une identité divergente sans mutation", async () => {
    assertE2eResetAllowed({
      allowReset: process.env.JIROO_ALLOW_E2E_RESET,
      databaseUrl: process.env.DATABASE_URL,
    });
    const client = await databasePool.connect();
    try {
      const verified = await verifyE2eDatabaseIdentity(
        client,
        process.env.JIROO_E2E_DATABASE_SYSTEM_IDENTIFIER,
      );
      expect(verified.databaseName).toBe("jiroo_e2e");
      expect(verified.systemIdentifierFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u);

      await expect(verifyE2eDatabaseIdentity(
        client,
        "identity-that-cannot-match-postgresql",
      )).rejects.toThrow("identité PostgreSQL effective");
    } finally {
      client.release();
    }
  });
});
