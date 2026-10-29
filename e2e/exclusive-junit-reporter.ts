import { rm } from "node:fs/promises";
import type { Reporter } from "@playwright/test/reporter";
import {
  publishExclusiveJunitReport,
  type ExclusiveJunitPaths,
} from "../scripts/e2e-junit-report";

export default class ExclusiveJunitReporter implements Reporter {
  constructor(private readonly paths: ExclusiveJunitPaths & { _mode?: string }) {}

  async onExit(): Promise<void> {
    // Playwright supplies this mode to reporter constructors; the CLI regression
    // test guards the integration because the option is not part of its public types.
    if (this.paths._mode === "list") {
      await rm(this.paths.temporaryPath, { force: true });
      return;
    }
    await publishExclusiveJunitReport(this.paths);
  }
}
