import "server-only";

import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { verification } from "@/lib/db/schema/auth";

type Executor = Pick<typeof db, "delete">;

// Better Auth 1.6.22 two-factor plugin state kept in `verification` (plain
// identifiers: Jiroo does not set `verification.storeIdentifier`):
// - trusted devices: identifier `trust-device-<random>`, value = user id.
//   The plugin accepts any unexpired row whose value matches the user, so a
//   trust cookie is not tied to a factor generation.
const TRUST_DEVICE_PREFIX = "trust-device-";

/**
 * Deletes every trusted-device record of a user, server-side. A browser still
 * holding the cookie then has to pass the TOTP step again.
 */
export async function revokeTrustedDevices(executor: Executor, userId: string): Promise<number> {
  const revoked = await executor
    .delete(verification)
    .where(and(eq(verification.value, userId), like(verification.identifier, `${TRUST_DEVICE_PREFIX}%`)))
    .returning({ id: verification.id });
  return revoked.length;
}

// - pending sign-in challenges (password verified, TOTP not yet): identifier
//   `2fa-<random>`, value = user id, plus an attempt counter identified
//   `2fa-attempts-<challenge identifier>` whose value is the attempt count.
//   Completing a challenge only checks the TOTP, never the password again.
const CHALLENGE_PREFIX = "2fa-";
const ATTEMPTS_PREFIX = "2fa-attempts-";

/**
 * Deletes every pending two-factor sign-in challenge of a user and their
 * attempt counters, so a password step passed before a password change or
 * reset can no longer be completed.
 */
export async function revokePendingSignIns(executor: Executor, userId: string): Promise<number> {
  const challenges = await executor
    .delete(verification)
    .where(and(eq(verification.value, userId), like(verification.identifier, `${CHALLENGE_PREFIX}%`)))
    .returning({ identifier: verification.identifier });
  if (challenges.length > 0) {
    await executor.delete(verification).where(
      inArray(
        verification.identifier,
        challenges.map((challenge) => `${ATTEMPTS_PREFIX}${challenge.identifier}`),
      ),
    );
  }
  return challenges.length;
}
