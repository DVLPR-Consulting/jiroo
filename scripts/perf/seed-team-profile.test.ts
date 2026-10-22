// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertTeamProfileSeedAllowed } from "./seed-team-profile";
const valid = { JIROO_ALLOW_TEAM_PROFILE_SEED: "1", DATABASE_URL: "postgresql://user:secret@127.0.0.1:5434/jir41_perf_012345abcdef" };
describe("team profile seed safety", () => {
  it("requires explicit opt-in", () => expect(() => assertTeamProfileSeedAllowed({ ...valid, JIROO_ALLOW_TEAM_PROFILE_SEED: undefined })).toThrow());
  it("accepts the isolated local namespace", () => expect(() => assertTeamProfileSeedAllowed(valid)).not.toThrow());
  it.each([
    "postgresql://user:secret@remote.example:5434/jir41_perf_012345abcdef",
    "postgresql://user:secret@localhost:5433/jir41_perf_012345abcdef",
    "postgresql://user:secret@localhost:5434/jiroo",
    "postgresql://user:secret@localhost:5434/jir41_perf_012345abcdef?host=remote.example",
    "postgresql://user:secret@localhost:5434/jir41_perf_012345abcdef?port=5433",
    "postgresql://user:secret@localhost:5434/jir41_perf_012345abcdef?options=-c%20search_path=other",
    "postgresql://user:secret@localhost:5434/jir41_perf_012345abcdef?service=production",
    "file:///jir41_perf_012345abcdef",
  ])("rejects remote, shared, or overridden targets: %s", (url) => expect(() => assertTeamProfileSeedAllowed({ ...valid, DATABASE_URL: url })).toThrow());
});
