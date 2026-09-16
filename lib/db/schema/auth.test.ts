// @vitest-environment node
import { getTableColumns } from "drizzle-orm";
import { twoFactor as twoFactorPlugin } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { twoFactor } from "./auth";

describe("two_factor Drizzle table", () => {
  const pluginFields = twoFactorPlugin().schema.twoFactor.fields;
  const columns = getTableColumns(twoFactor);

  it("exposes every field the Better Auth two-factor plugin requires", () => {
    const missing = Object.keys(pluginFields).filter(
      (field) => !(field in columns),
    );

    expect(missing).toEqual([]);
  });

  it("never stores a null failed-verification counter", () => {
    // Better Auth increments this column in SQL; NULL + 1 would stay NULL and
    // silently disable the TOTP lockout.
    expect(columns.failedVerificationCount.notNull).toBe(true);
    expect(columns.failedVerificationCount.default).toBe(
      pluginFields.failedVerificationCount.defaultValue,
    );
  });

  it("keeps lockedUntil nullable so unlocked rows carry no lock", () => {
    expect(columns.lockedUntil.notNull).toBe(false);
  });
});
