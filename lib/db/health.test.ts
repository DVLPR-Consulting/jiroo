// @vitest-environment node
import { createServer, type Socket } from "node:net";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("isolated database health connection", () => {
  it.each([false, true])("releases a stalled PostgreSQL connection (authenticated: %s)", async (authenticated) => {
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      if (authenticated) {
        // PostgreSQL AuthenticationOk + ReadyForQuery; then ignore the query.
        socket.once("data", () => socket.write(Buffer.from("5200000008000000005a0000000549", "hex")));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server port");
    vi.stubEnv("DATABASE_URL", `postgresql://test:test@127.0.0.1:${address.port}/health?sslmode=disable`);
    vi.resetModules();
    const { healthDb } = await import("./health");
    const pool = healthDb.$client;
    let rejected = false;
    const pending = healthDb.execute(sql`select 1`).catch(() => { rejected = true; });
    try {
      await vi.waitFor(() => expect(rejected).toBe(true), { timeout: 2500, interval: 25 });
      expect(pool.totalCount).toBe(0);
      expect(pool.waitingCount).toBe(0);
    } finally {
      for (const socket of sockets) socket.destroy();
      await pending;
      await pool.end();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
