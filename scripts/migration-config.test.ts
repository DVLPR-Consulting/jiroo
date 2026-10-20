// @vitest-environment node
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const LOCAL_URL = "postgresql://test:test@127.0.0.1:1/no_migrations_expected";

function run(entry: "migrate" | "config", directUrl: string | undefined) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: LOCAL_URL,
    DIRECT_DATABASE_URL: directUrl,
    // Never read a developer's real dotenv file or fall back to a live PG* host.
    DOTENV_CONFIG_PATH: path.join(tmpdir(), `jiroo-no-dotenv-${randomUUID()}`),
    PGHOST: "127.0.0.1", PGPORT: "1", PGUSER: "test", PGPASSWORD: "test",
    PGDATABASE: "no_migrations_expected",
  };
  if (directUrl === undefined) delete env.DIRECT_DATABASE_URL;
  const args = entry === "migrate"
    ? ["scripts/migrate.ts"]
    : ["--eval", "const config = require('./drizzle.config.ts').default; process.stdout.write(JSON.stringify(config));"];
  return spawnSync(process.execPath, ["--import", "tsx", ...args], {
    cwd: ROOT, env, encoding: "utf8", timeout: 5000,
  });
}

describe("explicit migration connection", () => {
  for (const entry of ["migrate", "config"] as const) {
    it.each([undefined, "", "   "])(`${entry} refuses a missing or blank owner URL (%s) before connecting`, (url) => {
      const result = run(entry, url);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/DIRECT_DATABASE_URL.*required/i);
      expect(result.stderr).not.toContain("ECONNREFUSED");
    });
  }

  it("loads the explicit direct URL in Drizzle config without consulting DATABASE_URL", () => {
    const result = run("config", "  postgresql://owner:local@127.0.0.1:1/owner_only  ");
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).dbCredentials.url).toBe("postgresql://owner:local@127.0.0.1:1/owner_only");
  });
});
