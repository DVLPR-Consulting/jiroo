import "server-only";

import { and, eq, like } from "drizzle-orm";
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
