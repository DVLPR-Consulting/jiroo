import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const DB_SUITES = "**/*.integration.test.ts";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    exclude: [...configDefaults.exclude, "e2e/**"],
    projects: [
      {
        extends: true,
        test: { name: "unit", exclude: [...configDefaults.exclude, "e2e/**", DB_SUITES] },
      },
      {
        // The DB suites share one database (JIROO_RUN_DB_TESTS=1): in
        // parallel they collide on global counts and short random keys
        // (JIR-48). One file at a time keeps them deterministic.
        extends: true,
        test: { name: "db", include: [DB_SUITES], fileParallelism: false },
      },
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
