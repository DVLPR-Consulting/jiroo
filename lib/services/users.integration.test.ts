import "dotenv/config";

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { setUserRole } from "@/lib/services/users";

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("user service persistence", () => {
  it("rejects a role update when the user does not exist", async () => {
    await expect(setUserRole(randomUUID(), "viewer")).rejects.toThrow("Utilisateur introuvable.");
  });
});
