import type { Reporter } from "@playwright/test/reporter";
import {
  publishExclusiveJunitReport,
  type ExclusiveJunitPaths,
} from "../scripts/e2e-junit-report";

export default class ExclusiveJunitReporter implements Reporter {
  constructor(private readonly paths: ExclusiveJunitPaths) {}

  async onExit(): Promise<void> {
    await publishExclusiveJunitReport(this.paths);
  }
}
