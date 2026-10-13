/**
 * Matches an item key on its own: `CASS-1` must not match `CASS-12`, `ABS-1`
 * must not match `LABS-1`, and neither may match the
 * seeded `CASS-9001` once the key sequence restarts at 1 (JIR-96).
 */
export function keyPattern(key: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\d)`);
}
