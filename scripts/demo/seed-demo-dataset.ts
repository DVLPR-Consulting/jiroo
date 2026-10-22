/**
 * Demo dataset: replays four months of a fictitious team's work (June to
 * 21 October 2026) through the real services, so keys, ranks, activity,
 * sprint reports, releases and notifications are what the app itself would
 * have produced. A simulated clock dates every action; timestamps the
 * database stamps itself are moved to the same simulated instant after each
 * action. The accounts already in the database join the team.
 *
 *   JIROO_DEMO_SEED=1 DATABASE_URL=… pnpm tsx scripts/demo/seed-demo-dataset.ts
 *
 * Runs once per database: it refuses a database that already has the demo team.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  BACKLOGS, COMMENTS, EMAIL_DOMAIN, GROUPS, LABELS, PEOPLE, WEB_LINKS,
  type Actor, type BacklogSpec, type EpicSpec, type PersonKey, type TaskSpec,
} from "./demo-content";

// ---------------------------------------------------------------------------
// Simulated clock, installed for the run only, before the services load.
// ---------------------------------------------------------------------------

const RealDate = Date;
let clockOffsetMs = 0;
class SimulatedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + clockOffsetMs);
    else super(...(args as [string]));
  }
  static override now() {
    return RealDate.now() + clockOffsetMs;
  }
}
function installClock() {
  clockOffsetMs = 0;
  globalThis.Date = SimulatedDate as unknown as DateConstructor;
}
function restoreClock() {
  clockOffsetMs = 0;
  globalThis.Date = RealDate;
}

export class DemoSeedError extends Error {}

/**
 * Run before importing any module that opens a database connection. A remote
 * database must be the DEV one named by JIROO_DEMO_ALLOWED_HOST, which the
 * DEV launcher's configuration provides.
 */
export function assertDemoSeedAllowed(env: Readonly<Record<string, string | undefined>>): void {
  if (env.JIROO_DEMO_SEED !== "1") throw new DemoSeedError("Set JIROO_DEMO_SEED=1 explicitly.");
  let url: URL;
  try { url = new URL(env.DATABASE_URL ?? ""); } catch { throw new DemoSeedError("DATABASE_URL is missing or invalid."); }
  const local = ["127.0.0.1", "localhost"].includes(url.hostname);
  const approvedDev = env.JIROO_ENVIRONMENT === "dev" && !!env.JIROO_DEMO_ALLOWED_HOST && url.hostname === env.JIROO_DEMO_ALLOWED_HOST;
  if (!local && !approvedDev) throw new DemoSeedError("Only a local database or the approved DEV database is allowed.");
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

/** The simulated present: nothing happens after it. */
const PRESENT = new RealDate("2026-10-22T09:45:00+02:00").getTime();
const KICKOFF = "2026-06-15";
const FIRST_SPRINT = "2026-08-10";
const ACTIVE_SPRINT = 5;
const PLANNED_SPRINTS = [6, 7];
const CAPACITY = [16, 18, 19, 20, 19, 21, 19, 18];

/** A Paris wall-clock instant (summer time until 25 October 2026). */
function paris(day: string, hm: string): Date {
  return new RealDate(`${day}T${hm}:00${day >= "2026-10-25" ? "+01:00" : "+02:00"}`);
}
const past = (when: Date) => when.getTime() <= PRESENT;
function addDays(day: string, days: number): string {
  const d = new RealDate(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** The n-th working day of a sprint that starts on a Monday. */
function sprintDay(start: string, n: number): string {
  return addDays(start, n + Math.floor(n / 5) * 2);
}
function workdaysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const weekday = new RealDate(`${d}T12:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(d);
  }
  return days;
}
/** The next working day from `day` included. */
function workday(day: string): string {
  return workdaysBetween(day, addDays(day, 3))[0]!;
}
const sprintStart = (k: number) => addDays(FIRST_SPRINT, 14 * k);
const sprintEnd = (k: number) => addDays(sprintStart(k), 11);
const releaseFor = (k: number) => (k <= 1 ? 0 : k <= 3 ? 1 : k <= 6 ? 2 : 3);

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

let seed = 0x5eed2026;
function random(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const chance = (p: number) => random() < p;
function pick<T>(values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!;
}
/** A random time between two « HH:MM ». */
function between(from: string, to: string): string {
  const [fh, fm] = from.split(":").map(Number) as [number, number];
  const [th, tm] = to.split(":").map(Number) as [number, number];
  const at = fh * 60 + fm + Math.floor(random() * (th * 60 + tm - fh * 60 - fm));
  return `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Content helpers
// ---------------------------------------------------------------------------

const POINTS = [1, 2, 2, 3, 3, 3, 5, 5, 8];
/** Working days a task takes, by estimate. */
const DURATION: Record<number, number> = { 1: 1, 2: 2, 3: 3, 5: 4, 8: 6 };
const LABEL_RULES: [string, RegExp][] = [
  ["sécurité", /authentif|2FA|TOTP|session|habilitation|certificat|chiffr|secret|accès|verrouill|Journaliser|signature|vulnérab|secours|clés/i],
  ["accessibilité", /RGAA|ARIA|clavier|contraste|accessibilit/i],
  ["performance", /performance|Paralléliser|secondes|charge|Indexer|lots|file d’attente|pertinence/i],
  ["RGPD", /RGPD|AIPD|registre|ré-identification|Purge|non pseudonymisées/i],
  ["UX", /Widget|Maquette|Mode sombre|Raccourci|Aperçu|Visionneuse|surlign|libellé|Personnaliser/i],
  ["dette technique", /Mise à jour|Synchronisation|Archivage|Rétention|Centralisation/i],
];

type TaskPlan = {
  title: string;
  bug: boolean;
  points: number | null;
  fixedNullPoints: boolean;
  description: string;
  sub: string[];
  epicIndex: number;
};

function taskPlan(spec: TaskSpec, epic: EpicSpec, epicIndex: number): TaskPlan {
  const raw = typeof spec === "string" ? { title: spec } : spec;
  const bug = raw.title.startsWith("!");
  const title = bug ? raw.title.slice(1) : raw.title;
  const fixedNullPoints = "points" in raw && raw.points === null;
  const points = fixedNullPoints ? null : (raw.points ?? (bug ? pick([1, 2, 2, 3]) : pick(POINTS)));
  return {
    title, bug, points, fixedNullPoints, epicIndex,
    sub: raw.sub ?? [],
    description: raw.description ?? (bug ? bugDescription(title) : storyDescription(title, epic)),
  };
}

function storyDescription(title: string, epic: EpicSpec): string {
  const need = title.charAt(0).toLowerCase() + title.slice(1);
  return [
    "## Contexte", "", epic.description, "",
    "## Besoin", "", `Pouvoir ${need.replace(/\.$/, "")} directement dans l’outil, sans ressaisie.`, "",
    "## Critères d’acceptation", "",
    "- [ ] Le comportement est conforme à la maquette validée en atelier",
    "- [ ] Les droits d’accès sont vérifiés côté serveur",
    "- [ ] Les cas d’erreur affichent un message compréhensible",
    "- [ ] Le parcours est utilisable au clavier",
  ].join("\n");
}

function bugDescription(title: string): string {
  return [
    "## Constat", "", `${title}.`, "",
    "## Étapes pour reproduire", "",
    "1. Se connecter en préproduction avec un compte de greffier",
    "2. Ouvrir l’écran concerné",
    "3. Reproduire l’action décrite dans le titre", "",
    "## Résultat attendu", "", "Le comportement décrit dans la spécification, sans message d’erreur.", "",
    "## Environnement", "", "Préproduction, Firefox 131 et Edge 130.",
  ].join("\n");
}

/** Two or three epics at a time, in the order the product owner wrote them. */
function interleave(plans: TaskPlan[], epicCount: number): TaskPlan[] {
  const byEpic = Array.from({ length: epicCount }, (_, e) => plans.filter((p) => p.epicIndex === e));
  const ordered: TaskPlan[] = [];
  for (let e = 0; e < epicCount; e += 3) {
    const wave = byEpic.slice(e, e + 3);
    while (wave.some((list) => list.length)) for (const list of wave) if (list.length) ordered.push(list.shift()!);
  }
  return ordered;
}

function labelsFor(plan: TaskPlan, labels: Map<string, string>): string[] {
  const names = LABEL_RULES.filter(([, rule]) => rule.test(plan.title)).map(([name]) => name);
  if (!plan.bug && chance(0.12)) names.push("recette métier");
  return names.slice(0, 3).map((name) => labels.get(name)).filter((id): id is string => Boolean(id));
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function loadServices() {
  const [items, backlogs, users, authorization, labels, releases, sprints, lifecycle, comments, links, webLinks, views, database] =
    await Promise.all([
      import("@/lib/services/items"), import("@/lib/services/backlogs"), import("@/lib/services/users"),
      import("@/lib/services/authorization-admin"), import("@/lib/services/labels"), import("@/lib/services/releases"),
      import("@/lib/services/sprints"), import("@/lib/services/sprint-lifecycle"), import("@/lib/services/comments"),
      import("@/lib/services/links"), import("@/lib/services/web-links"), import("@/lib/services/views"),
      import("@/lib/db"),
    ]);
  return { items, backlogs, users, authorization, labels, releases, sprints, lifecycle, comments, links, webLinks, views, database };
}

type Status = { todo: string; doing: string; review: string; done: string };
type LiveTask = TaskPlan & {
  id: string;
  key: string;
  epicId: string;
  assignee: string | null;
  subIds: string[];
  state: keyof Status;
  remaining: number;
  sprint: number | null;
  blockedBy: LiveTask | null;
};
type LiveBacklog = {
  spec: BacklogSpec;
  id: string;
  status: Status;
  labels: Map<string, string>;
  releases: string[];
  epics: { id: string; start: string | null; due: string | null; done: boolean }[];
  tasks: LiveTask[];
  queue: LiveTask[];
  sprints: Map<number, string>;
  bugIndex: number;
};

type Services = Awaited<ReturnType<typeof loadServices>>;

/**
 * The services open their own transactions, so the run cannot be atomic:
 * everything that could make it stop halfway is checked before the first
 * write, and one run at a time holds a database-wide lock.
 */
export async function seedDemoDataset(): Promise<string> {
  assertDemoSeedAllowed(process.env);
  installClock();
  try {
    const svc = await loadServices();
    const lock = await svc.database.databasePool.connect();
    try {
      const locked = await lock.query<{ ok: boolean }>("select pg_try_advisory_lock(hashtext('jiroo:demo-seed')) as ok");
      if (!locked.rows[0]?.ok) throw new DemoSeedError("Another demo seed is running on this database.");
      try {
        return await run(svc);
      } finally {
        await lock.query("select pg_advisory_unlock(hashtext('jiroo:demo-seed'))").catch(() => undefined);
      }
    } finally {
      lock.release();
    }
  } finally {
    restoreClock();
  }
}

/** Refuses, before any write, a database where the replay could not run to its end. */
async function preflight(pool: Services["database"]["databasePool"]): Promise<void> {
  const fail = (message: string) => { throw new DemoSeedError(`Preflight: ${message}`); };
  const already = await pool.query(`select 1 from "user" where email like $1 limit 1`, [`%@${EMAIL_DOMAIN}`]);
  if (already.rowCount) fail("the demo team already exists in this database.");
  const admins = await pool.query(`select 1 from "user" where role = 'admin' limit 1`);
  if (!admins.rowCount) fail("no administrator account: create one first (pnpm db:seed or db:bootstrap-admin).");
  const roles = await pool.query<{ key: string }>("select key from project_roles where key = any($1)", [["administrators", "members", "viewers"]]);
  if (roles.rowCount !== 3) fail("the default project roles are missing.");
  const groups = await pool.query<{ name: string }>(
    "select name from user_groups where lower(name) = any($1)", [GROUPS.map((group) => group.name.toLocaleLowerCase("fr"))],
  );
  if (groups.rowCount) fail(`groups already exist: ${groups.rows.map((row) => row.name).join(", ")}.`);
  for (const spec of BACKLOGS) {
    const found = await pool.query<{ id: string }>("select id from backlogs where upper(key) = $1", [spec.key]);
    const id = found.rows[0]?.id;
    if (!id) continue;
    const sprints = await pool.query("select 1 from sprints where backlog_id = $1 limit 1", [id]);
    if (sprints.rowCount) fail(`backlog ${spec.key} already has sprints.`);
    const releases = await pool.query<{ name: string }>(
      "select name from releases where backlog_id = $1 and lower(btrim(name)) = any($2)",
      [id, spec.releases.map((release) => release.name.toLocaleLowerCase("fr"))],
    );
    if (releases.rowCount) fail(`backlog ${spec.key} already has releases named ${releases.rows.map((row) => row.name).join(", ")}.`);
    const categories = await pool.query<{ category: string }>("select distinct category from statuses where backlog_id = $1", [id]);
    const present = new Set(categories.rows.map((row) => row.category));
    if (!["todo", "in_progress", "done"].every((category) => present.has(category))) fail(`backlog ${spec.key} lacks a to-do, in-progress or done status.`);
  }
}

async function run(svc: Services): Promise<string> {
  const pool = svc.database.databasePool;
  const log: string[] = [];

  // --- Guards and existing accounts ----------------------------------------
  await preflight(pool);
  const existing = await pool.query<{ id: string; name: string; role: string }>(
    `select id, name, role from "user" order by (role = 'admin') desc, created_at`,
  );
  const owner = existing.rows[0]!.id;
  // Existing accounts keep their rights: the others join as members, or as
  // readers when they are readers; only working accounts get demo tasks.
  const others = existing.rows.slice(1).map((row) => ({ id: row.id, role: row.role === "viewer" ? "viewers" : "members" }));
  const me = [owner, ...others.filter((other) => other.role === "members").map((other) => other.id)];
  const names = new Map(existing.rows.map((row) => [row.id, row.name]));
  const notificationsBefore = (await pool.query<{ id: string }>("select id from notifications where user_id = any($1)", [me])).rows.map((row) => row.id);
  let meTurn = 0;

  // --- Timestamps the database stamps itself --------------------------------
  // Append-only tables (sprint and release history) refuse updates; the
  // services give them the simulated instant themselves, except the release
  // publication rows, which keep the real date.
  const immutable = await pool.query<{ table: string }>(
    `select distinct event_object_table as table from information_schema.triggers
     where trigger_schema = 'public' and event_manipulation = 'UPDATE'`,
  );
  const skipped = new Set([...immutable.rows.map((row) => row.table), "session", "account", "verification", "two_factor", "user"]);
  const columns = await pool.query<{ table: string; column: string; type: string }>(
    `select table_name as table, column_name as column, data_type as type from information_schema.columns
     where table_schema = 'public' order by 1, 2`,
  );
  const tableColumns = new Map<string, Set<string>>();
  const targets = new Map<string, string[]>();
  for (const { table, column, type } of columns.rows) {
    tableColumns.set(table, (tableColumns.get(table) ?? new Set()).add(column));
    if (type !== "timestamp with time zone" || skipped.has(table) || table.startsWith("repo_webhook")) continue;
    targets.set(table, [...(targets.get(table) ?? []), column]);
  }
  // Only rows of the demo are re-dated: those of its backlogs ($4), of their
  // items, of its groups ($5), and its audit events ($6: group and user ids).
  // Tables without such a link keep the real date.
  const demoItems = "(select id from items where backlog_id = any(p.b))";
  function ownedBy(table: string): string | null {
    const has = (column: string) => tableColumns.get(table)?.has(column) ?? false;
    if (table === "backlogs") return "id = any(p.b)";
    if (table === "user_groups") return "id = any(p.g)";
    if (table === "group_members") return "group_id = any(p.g)";
    if (table === "security_audit_events") return "(backlog_id = any(p.b) or target_id = any(p.t))";
    if (table === "item_links") return `source_id in ${demoItems}`;
    if (has("backlog_id")) return "backlog_id = any(p.b)";
    if (has("item_id")) return `item_id in ${demoItems}`;
    return null;
  }
  const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`;
  const shiftStatements = [...targets].flatMap(([table, cols]) => {
    const owned = ownedBy(table);
    if (!owned) return [];
    const sets = cols.map((c) =>
      `${quoted(c)} = case when ${quoted(c)} between $1 and $2 then ${quoted(c)} + make_interval(secs => $3::double precision) else ${quoted(c)} end`);
    return [`with p as (select $4::uuid[] as b, $5::uuid[] as g, $6::text[] as t) update ${quoted(table)} set ${sets.join(", ")} from p where ${owned} and (${cols.map((c) => `${quoted(c)} between $1 and $2`).join(" or ")})`];
  });
  const demoBacklogIds: string[] = [];
  const demoGroupIds: string[] = [];
  const demoUserIds: string[] = [];

  /** Runs `action` at the simulated instant `when`, then dates what the database stamped for the demo. */
  async function at<T>(when: Date, action: () => Promise<T>): Promise<T> {
    if (!past(when)) throw new DemoSeedError(`Instant after the simulated present: ${when.toISOString()}`);
    clockOffsetMs = when.getTime() - RealDate.now();
    const started = (await pool.query<{ t: Date }>("select clock_timestamp() as t")).rows[0]!.t.getTime();
    try {
      return await action();
    } finally {
      const ended = (await pool.query<{ t: Date }>("select clock_timestamp() as t")).rows[0]!.t.getTime();
      const params = [
        new RealDate(started - 2000).toISOString(), new RealDate(ended + 2000).toISOString(), (when.getTime() - started) / 1000,
        demoBacklogIds, demoGroupIds, [...demoGroupIds, ...demoUserIds],
      ];
      await Promise.all(shiftStatements.map((statement) => pool.query(statement, params)));
    }
  }

  // --- People and groups ------------------------------------------------------
  const people = {} as Record<PersonKey, string>;
  await at(paris(KICKOFF, "08:45"), async () => {
    for (const [key, person] of Object.entries(PEOPLE) as [PersonKey, (typeof PEOPLE)[PersonKey]][]) {
      const created = await svc.users.createUser({
        name: person.name, email: `${person.email}@${EMAIL_DOMAIN}`, password: randomBytes(24).toString("base64url"),
      });
      people[key] = created.id;
      demoUserIds.push(created.id);
      names.set(created.id, person.name);
    }
  });
  const who = (actor: Actor): string => (actor === "me" ? me[meTurn++ % me.length]! : people[actor]);

  const roles = await pool.query<{ id: string; key: string }>("select id, key from project_roles");
  const roleId = (key: string) => {
    const role = roles.rows.find((row) => row.key === key);
    if (!role) throw new DemoSeedError(`Missing project role ${key}.`);
    return role.id;
  };
  const groups: { id: string; role: string }[] = [];
  await at(paris(KICKOFF, "09:00"), async () => {
    for (const group of GROUPS) {
      const created = await svc.authorization.createGroup({ name: group.name }, owner);
      demoGroupIds.push(created.id);
      for (const member of group.members) await svc.authorization.addGroupMember({ groupId: created.id, userId: people[member] }, owner);
      groups.push({ id: created.id, role: group.role });
    }
  });

  // --- Backlogs: setup and grooming ---------------------------------------
  const live: LiveBacklog[] = [];
  for (const [index, spec] of BACKLOGS.entries()) live.push(await setUpBacklog(spec, index));

  // --- Scrum: sprints, releases and everyday work -----------------------------
  const scrum = live.filter((b) => b.spec.mode === "scrum");
  for (const b of scrum) {
    const first = await at(paris("2026-08-07", "15:00"), () => svc.sprints.createSprint({ backlogId: b.id }, people[b.spec.po]));
    b.sprints.set(0, first.id);
  }
  for (let k = 0; k <= ACTIVE_SPRINT; k++) {
    const planned = new Map<LiveBacklog, LiveTask[]>();
    for (const b of scrum) planned.set(b, await planSprint(b, k));
    for (const b of scrum) await startSprint(b, k);
    for (let d = 0; d < 10; d++) {
      const day = sprintDay(sprintStart(k), d);
      if (!past(paris(day, "18:45"))) break;
      for (const b of scrum) await workDay(b, k, d, day, planned.get(b)!);
    }
    if (k < ACTIVE_SPRINT) {
      for (const b of scrum) await completeSprint(b, k);
      if (k === 1 || k === 3) for (const b of scrum) await publishRelease(b, k === 1 ? 0 : 1, sprintEnd(k));
    }
  }
  for (const b of scrum) await prepareNextSprints(b);

  // --- Kanban --------------------------------------------------------------
  for (const b of live.filter((x) => x.spec.mode === "kanban")) await runKanban(b);

  // --- Roadmap and inbox -----------------------------------------------------
  for (const b of scrum) await projectRoadmap(b);
  // Older demo notifications have been read; those from before the run are left alone.
  await pool.query(
    `update notifications set read_at = created_at + interval '2 hours'
     where user_id = any($1) and created_at < $2 and read_at is null and not (id = any($3::uuid[])) and item_id in (select id from items where backlog_id = any($4::uuid[]))`,
    [me, new RealDate("2026-10-12T00:00:00+02:00").toISOString(), notificationsBefore, demoBacklogIds],
  );
  return [...log, `Comptes existants intégrés à l’équipe : ${me.map((id) => names.get(id)).join(", ")}`].join("\n");

  // ===========================================================================

  async function setUpBacklog(spec: BacklogSpec, index: number): Promise<LiveBacklog> {
    const po = people[spec.po];
    const day = addDays(KICKOFF, index < 3 ? 0 : 1);
    const backlog = await at(paris(day, `09:${String(15 + index * 5).padStart(2, "0")}`), async () => {
      const found = await pool.query<{ id: string }>("select id from backlogs where key = $1", [spec.key]);
      const reused = found.rows[0]?.id;
      const id = reused ?? (await svc.backlogs.createBacklog({ key: spec.key, name: spec.name, color: spec.color }, owner)).id;
      demoBacklogIds.push(id);
      for (const group of groups) {
        await svc.authorization.assignBacklogRoleActor(
          { backlogId: id, projectRoleId: roleId(group.role), principal: { type: "group", groupId: group.id } }, owner,
        );
      }
      // In an existing backlog, accounts that already have a role keep it.
      const placed = new Set(reused
        ? (await pool.query<{ user_id: string }>("select user_id from backlog_role_actors where backlog_id = $1 and user_id is not null", [id])).rows.map((row) => row.user_id)
        : [owner]);
      for (const other of others) {
        if (placed.has(other.id)) continue;
        await svc.authorization.assignBacklogRoleActor(
          { backlogId: id, projectRoleId: roleId(other.role), principal: { type: "user", userId: other.id } }, owner,
        );
      }
      await svc.backlogs.updateBacklog({ id, key: spec.key, name: spec.name, color: spec.color, leadUserId: po }, owner);
      return { id };
    });
    const statusRows = await pool.query<{ id: string; category: string }>(
      `select id, category from statuses where backlog_id = $1 order by "order"`, [backlog.id],
    );
    const inCategory = (category: string) => statusRows.rows.filter((row) => row.category === category);
    const b: LiveBacklog = {
      spec, id: backlog.id, labels: new Map(), releases: [], epics: [], tasks: [], queue: [], sprints: new Map(), bugIndex: 0,
      status: {
        todo: inCategory("todo")[0]!.id,
        doing: inCategory("in_progress")[0]!.id,
        review: (inCategory("in_progress")[1] ?? inCategory("in_progress")[0])!.id,
        done: inCategory("done")[0]!.id,
      },
    };

    await at(paris(day, "10:30"), async () => {
      for (const name of LABELS) b.labels.set(name, (await svc.labels.createLabel({ backlogId: b.id, name })).id);
      const dates = [["2026-08-10", "2026-09-04"], ["2026-09-07", "2026-10-02"], ["2026-10-05", "2026-11-13"], ["2026-11-16", "2027-01-29"]];
      for (const [r, release] of spec.releases.entries()) {
        const created = await svc.releases.createRelease({
          backlogId: b.id, name: release.name, description: release.description, driverId: po,
          startDate: dates[r]![0], targetDate: dates[r]![1],
        }, po, randomUUID());
        b.releases.push(created.id);
      }
      await svc.backlogs.setBacklogStar({ backlogId: b.id, starred: true }, owner);
    });

    // Components and epics, written by the product owner the day after kickoff.
    const found = await pool.query<{ id: string; title: string; type: string; key: string }>(
      "select id, title, type, key from items where backlog_id = $1 and deleted_at is null", [b.id],
    );
    const reuse = (type: string, title: string) => found.rows.find((row) => row.type === type && row.title === title);
    const plans: TaskPlan[] = [];
    for (const [c, component] of spec.components.entries()) {
      const componentId = await at(paris(workday(addDays(day, 1)), between("09:00", "10:30")), async () =>
        reuse("composant", component.title)?.id ?? (await svc.items.createItem({
          backlogId: b.id, type: "composant", parentId: null, title: component.title, description: component.description,
          priority: 2, startDate: spec.mode === "kanban" ? "2026-07-06" : FIRST_SPRINT,
          dueDate: ["2026-12-18", "2027-01-29", "2027-03-26"][c] ?? "2027-03-26",
        }, po)).id,
      );
      for (const epic of component.epics) {
        const epicIndex = b.epics.length;
        const kanbanStart = addDays("2026-07-06", 21 * epicIndex);
        const epicId = await at(paris(workday(addDays(day, 1)), between("10:30", "17:30")), async () => {
          const reused = reuse("epic", epic.title);
          if (reused) {
            await svc.items.updateItem({ id: reused.id, description: epic.description }, po);
            return reused.id;
          }
          return (await svc.items.createItem({
            backlogId: b.id, type: "epic", parentId: componentId, title: epic.title, description: epic.description, priority: 2,
            ...(spec.mode === "kanban" ? { startDate: kanbanStart, dueDate: addDays(kanbanStart, 55) } : {}),
          }, po)).id;
        });
        b.epics.push({ id: epicId, start: null, due: null, done: false });
        for (const task of epic.tasks) plans.push(taskPlan(task, epic, epicIndex));
      }
    }

    // Tasks, written during the grooming weeks.
    const ordered = interleave(plans, b.epics.length);
    const groomingDays = workdaysBetween(addDays(day, 2), spec.mode === "kanban" ? "2026-07-17" : "2026-08-07");
    for (const [n, plan] of ordered.entries()) {
      const author = plan.bug ? people[spec.qa] : chance(0.8) ? po : people[spec.business];
      const groomDay = groomingDays[Math.floor((n / ordered.length) * groomingDays.length)]!;
      const labelIds = labelsFor(plan, b.labels);
      const estimate = plan.fixedNullPoints || chance(0.3) ? null : plan.points;
      const epicId = b.epics[plan.epicIndex]!.id;
      const reused = reuse("tache", plan.title);
      const task = await at(paris(groomDay, between("09:00", "18:00")), async () => {
        if (reused) {
          await svc.items.updateItem({ id: reused.id, description: plan.description, estimatePoints: estimate, labelIds }, po);
          return reused;
        }
        return svc.items.createItem({
          backlogId: b.id, type: "tache", parentId: epicId, title: plan.title,
          description: plan.description, kind: plan.bug ? "bug" : "feature",
          priority: plan.bug ? pick([3, 3, 4]) : pick([0, 1, 1, 2, 2, 2, 2, 3, 3, 4]),
          estimatePoints: estimate, labelIds,
        }, author);
      });
      const liveTask: LiveTask = {
        ...plan, id: task.id, key: task.key, epicId, assignee: null, subIds: [], state: "todo",
        remaining: DURATION[plan.points ?? 3] ?? 2, sprint: null, blockedBy: null,
      };
      b.tasks.push(liveTask);
      b.queue.push(liveTask);
      if (chance(0.15)) {
        const link = pick(WEB_LINKS);
        await at(paris(groomDay, "18:10"), () => svc.webLinks.addWebLink({
          itemId: task.id, title: link.title, url: link.url.replace("{key}", task.key.toLowerCase()),
        }, po));
      }
    }
    // A few related tasks, as the team discovers them.
    for (let r = 0; r < 6; r++) {
      const a = pick(b.tasks);
      const other = b.tasks.find((t) => t.epicId === a.epicId && t.id !== a.id);
      if (!other) continue;
      await at(paris("2026-07-24", between("14:00", "17:00")), () =>
        svc.links.addLink({ sourceId: a.id, targetId: other.id, type: "relates" }, po).catch(() => undefined));
    }
    // A duplicate written by mistake, then put in the trash.
    const original = b.tasks[3];
    if (original) {
      const duplicate = await at(paris("2026-07-01", "10:12"), () => svc.items.createItem({
        backlogId: b.id, type: "tache", parentId: original.epicId, title: `${original.title} (doublon)`, priority: 1,
      }, people[spec.business]));
      await at(paris("2026-07-01", "11:40"), () => svc.items.softDeleteItem({ id: duplicate.id }, po));
    }
    // Views shared with the team.
    if (spec.mode === "scrum") {
      await at(paris("2026-07-24", "16:30"), async () => {
        await svc.views.createView({
          name: "Bugs ouverts", backlogId: b.id, displayMode: "list",
          filters: { kind: ["bug"], statusIds: [b.status.todo, b.status.doing, b.status.review] },
          group: null, sort: { field: "priority", dir: "desc" }, shared: true,
        }, po);
        await svc.views.createView({
          name: "Qui fait quoi", backlogId: b.id, displayMode: "board", filters: {}, group: "assignee", sort: null, shared: true,
        }, po);
      });
    }
    return b;
  }

  async function planSprint(b: LiveBacklog, k: number): Promise<LiveTask[]> {
    const po = people[b.spec.po];
    const start = sprintStart(k);
    const sprintId = b.sprints.get(k)!;
    const carried = b.tasks.filter((t) => t.sprint === k);
    let load = carried.reduce((sum, t) => sum + (t.points ?? 3), 0);
    const added: LiveTask[] = [];
    while (b.queue.length && load < CAPACITY[k]!) {
      const next = b.queue.shift()!;
      added.push(next);
      load += next.points ?? 3;
    }
    const release = b.releases[releaseFor(k)];
    await at(paris(start, "09:30"), async () => {
      if (added.length) await svc.sprints.assignItemsToSprint({ backlogId: b.id, sprintId, itemIds: added.map((t) => t.id) }, po);
      const loads = new Map<string, number>(b.spec.devs.map((dev) => [who(dev), 0]));
      for (const t of carried) if (t.assignee) loads.set(t.assignee, (loads.get(t.assignee) ?? 0) + t.remaining);
      for (const t of added) {
        const assignee = [...loads].sort((x, y) => x[1] - y[1])[0]![0];
        loads.set(assignee, loads.get(assignee)! + t.remaining);
        t.assignee = assignee;
        t.sprint = k;
        await svc.items.updateItem({
          id: t.id, assigneeId: assignee, estimatePoints: t.fixedNullPoints ? null : t.points,
          startDate: start, dueDate: sprintEnd(k), ...(release ? { fixVersionIds: [release] } : {}),
        }, po);
        for (const title of t.sub) {
          const sub = await svc.items.createItem({ backlogId: b.id, type: "soustache", parentId: t.id, title, priority: 2, assigneeId: assignee }, assignee);
          t.subIds.push(sub.id);
        }
      }
      for (const t of [...carried, ...added]) {
        const epic = b.epics.find((e) => e.id === t.epicId)!;
        const update: { id: string; startDate?: string; dueDate?: string; statusId?: string } = { id: epic.id };
        if (!epic.start) { epic.start = start; update.startDate = start; update.statusId = b.status.doing; }
        if (!epic.due || epic.due < sprintEnd(k)) { epic.due = addDays(sprintEnd(k), 14); update.dueDate = epic.due; }
        if (Object.keys(update).length > 1) await svc.items.updateItem(update, po);
      }
      if (!b.sprints.has(k + 1)) b.sprints.set(k + 1, (await svc.sprints.createSprint({ backlogId: b.id }, po)).id);
    });
    // One task waits for another of the same sprint.
    const waiting = added.filter((t) => t.subIds.length === 0);
    if (waiting.length >= 3) {
      const blocker = waiting[0]!;
      const blocked = waiting[waiting.length - 1]!;
      await at(paris(start, "11:20"), () => svc.links.addLink({ sourceId: blocker.id, targetId: blocked.id, type: "blocks" }, blocked.assignee ?? po));
      blocked.blockedBy = blocker;
    }
    return [...carried, ...added];
  }

  async function startSprint(b: LiveBacklog, k: number) {
    const start = sprintStart(k);
    await at(paris(start, "10:00"), () => svc.lifecycle.startSprint({
      id: b.sprints.get(k)!, backlogId: b.id, name: `${b.spec.key} Sprint ${k + 1}`, goal: b.spec.goals[k] ?? null,
      startAt: paris(start, "10:00").toISOString(), endAt: paris(sprintEnd(k), "17:00").toISOString(), capacityPoints: CAPACITY[k]!,
    }, people[b.spec.po]));
  }

  async function workDay(b: LiveBacklog, k: number, d: number, day: string, tasks: LiveTask[]) {
    const po = people[b.spec.po];
    const qa = people[b.spec.qa];
    // Mid-sprint: an estimate grows, and testing finds a bug.
    if (d === 1 && chance(0.6)) {
      const grown = tasks.find((t) => t.state === "todo" && t.points === 3);
      if (grown) {
        grown.points = 5;
        grown.remaining += 1;
        await at(paris(day, between("09:35", "09:55")), async () => {
          await svc.items.updateItem({ id: grown.id, estimatePoints: 5 }, grown.assignee ?? po);
          await svc.comments.addComment({
            itemId: grown.id, body: "Estimation revue à la hausse après la daily : la reprise des données existantes est plus lourde que prévu.",
          }, grown.assignee ?? po);
        });
      }
    }
    if (d === 2 && k !== 3 && b.bugIndex < b.spec.sprintBugs.length) {
      const title = b.spec.sprintBugs[b.bugIndex++]!.slice(1);
      const near = pick(tasks);
      const loads = new Map<string, number>();
      for (const t of tasks) if (t.assignee && t.state !== "done") loads.set(t.assignee, (loads.get(t.assignee) ?? 0) + t.remaining);
      const assignee = [...loads].sort((x, y) => x[1] - y[1])[0]?.[0] ?? po;
      const release = b.releases[releaseFor(k)];
      const bug = await at(paris(day, between("14:00", "16:00")), () => svc.items.createItem({
        backlogId: b.id, type: "tache", parentId: near.epicId, title, kind: "bug", priority: pick([3, 4]),
        description: bugDescription(title), estimatePoints: pick([1, 2]), assigneeId: assignee, sprintId: b.sprints.get(k)!,
        labelIds: [b.labels.get("recette métier")!], ...(release ? { fixVersionIds: [release] } : {}),
      }, qa));
      const liveBug: LiveTask = {
        title, bug: true, points: 2, fixedNullPoints: false, description: "", sub: [], epicIndex: 0, id: bug.id, key: bug.key,
        epicId: near.epicId, assignee, subIds: [], state: "todo", remaining: 1, sprint: k, blockedBy: null,
      };
      b.tasks.push(liveBug);
      tasks.push(liveBug);
    }
    // Everyone works on their own tasks, one at a time.
    const byAssignee = new Map<string, LiveTask[]>();
    for (const t of tasks) if (t.assignee && t.state !== "done") byAssignee.set(t.assignee, [...(byAssignee.get(t.assignee) ?? []), t]);
    const ready = (t: LiveTask) => t.state === "todo" && (!t.blockedBy || t.blockedBy.state === "done");
    for (const [assignee, queue] of byAssignee) {
      const current = queue.find((t) => t.state === "doing" || t.state === "review") ?? queue.find(ready);
      if (!current) continue;
      if (current.state === "review") {
        await advance(b, current, "done", day, "10:30", "12:30", qa);
        const next = queue.find(ready);
        if (next) await advance(b, next, "doing", day, "14:00", "16:00", assignee);
        continue;
      }
      if (current.state === "todo") await advance(b, current, "doing", day, "09:30", "11:00", assignee);
      current.remaining -= 1;
      if (current.remaining <= 0) await advance(b, current, "review", day, "16:00", "18:00", assignee);
      if (chance(0.22)) await comment(b, current, day);
    }
    // The product owner closes the epics whose tasks are all done.
    for (const epic of b.epics) {
      if (epic.done) continue;
      const children = b.tasks.filter((t) => t.epicId === epic.id);
      if (children.length && children.every((t) => t.state === "done")) {
        epic.done = true;
        await at(paris(day, "18:30"), () => svc.items.updateItem({ id: epic.id, statusId: b.status.done }, po));
      }
    }
  }

  async function advance(b: LiveBacklog, t: LiveTask, state: keyof Status, day: string, from: string, to: string, actor: string) {
    await at(paris(day, between(from, to)), async () => {
      if (state === "done") {
        for (const sub of t.subIds) await svc.items.updateItem({ id: sub, statusId: b.status.done }, actor);
      } else if (state === "doing") {
        for (const sub of t.subIds.slice(0, 1)) await svc.items.updateItem({ id: sub, statusId: b.status.doing }, t.assignee ?? actor);
      }
      await svc.items.updateItem({ id: t.id, statusId: b.status[state] }, actor);
    });
    t.state = state;
  }

  async function comment(b: LiveBacklog, t: LiveTask, day: string) {
    const template = pick(COMMENTS);
    const roleOf = { po: people[b.spec.po], qa: people[b.spec.qa], biz: people[b.spec.business], dev: t.assignee ?? people[b.spec.po], me: owner };
    const author = roleOf[template.by];
    const mentioned = template.mention ? roleOf[template.mention] : null;
    if (mentioned === author) return;
    const body = template.body.replace(/\{(po|qa|biz|dev|me)\}/g, (_, role: keyof typeof roleOf) => names.get(roleOf[role]) ?? "");
    await at(paris(day, between("10:00", "17:45")), () =>
      svc.comments.addComment({ itemId: t.id, body, mentionIds: mentioned ? [mentioned] : [] }, author));
  }

  async function completeSprint(b: LiveBacklog, k: number) {
    const unfinished = b.tasks.filter((t) => t.sprint === k && t.state !== "done");
    // A sprint closes only once every sub-task is done: the team finishes them first.
    const open = unfinished.filter((t) => t.subIds.length);
    if (open.length) {
      await at(paris(sprintEnd(k), "16:40"), async () => {
        for (const t of open) for (const sub of t.subIds) await svc.items.updateItem({ id: sub, statusId: b.status.done }, t.assignee ?? people[b.spec.po]);
      });
    }
    await at(paris(sprintEnd(k), "17:00"), () => svc.lifecycle.completeSprint({
      id: b.sprints.get(k)!, backlogId: b.id, destination: { type: "existing_sprint", sprintId: b.sprints.get(k + 1)! },
    }, people[b.spec.po]));
    for (const t of unfinished) t.sprint = k + 1;
    log.push(`${b.spec.key} Sprint ${k + 1} : ${b.tasks.filter((t) => t.sprint === k).length} tâches terminées, ${unfinished.length} reportées`);
  }

  async function publishRelease(b: LiveBacklog, r: number, day: string) {
    const releaseId = b.releases[r]!;
    await at(paris(day, "17:30"), async () => {
      const detail = await svc.releases.getReleaseDetail(b.id, releaseId);
      if (!detail) throw new DemoSeedError(`Release missing in ${b.spec.key}.`);
      await svc.releases.publishRelease({
        backlogId: b.id, releaseId, expectedRevision: detail.revision, expectedScopeRevision: detail.publicationScopeRevision,
        effectiveDate: day, incompleteDisposition: "move", destinationReleaseId: b.releases[r + 1]!,
      }, people[b.spec.po], randomUUID());
    });
  }

  /** The two sprints after the active one, already filled; and some late work in the active one. */
  async function prepareNextSprints(b: LiveBacklog) {
    const po = people[b.spec.po];
    for (const k of PLANNED_SPRINTS) {
      await at(paris("2026-10-21", k === 6 ? "15:00" : "15:30"), async () => {
        if (!b.sprints.has(k)) b.sprints.set(k, (await svc.sprints.createSprint({ backlogId: b.id }, po)).id);
        const sprintId = b.sprints.get(k)!;
        await svc.sprints.updateSprint({
          id: sprintId, backlogId: b.id, name: `${b.spec.key} Sprint ${k + 1}`, goal: b.spec.goals[k] ?? null,
          plannedStartAt: paris(sprintStart(k), "10:00").toISOString(), plannedEndAt: paris(sprintEnd(k), "17:00").toISOString(),
          capacityPoints: CAPACITY[k]!,
        }, po);
        const chosen: LiveTask[] = [];
        let load = 0;
        while (b.queue.length && load < CAPACITY[k]!) {
          const t = b.queue.shift()!;
          chosen.push(t);
          load += t.points ?? 3;
        }
        if (chosen.length) await svc.sprints.assignItemsToSprint({ backlogId: b.id, sprintId, itemIds: chosen.map((t) => t.id) }, po);
        for (const [n, t] of chosen.entries()) {
          t.sprint = k;
          t.assignee = who(b.spec.devs[n % b.spec.devs.length]!);
          await svc.items.updateItem({
            id: t.id, assigneeId: t.assignee, startDate: sprintStart(k), dueDate: sprintEnd(k),
            fixVersionIds: [b.releases[releaseFor(k)]!],
          }, po);
        }
      });
    }
    await at(paris("2026-10-21", "16:10"), async () => {
      const active = b.tasks.filter((t) => t.sprint === ACTIVE_SPRINT && t.state !== "done");
      for (const t of active.slice(0, 2)) await svc.items.updateItem({ id: t.id, dueDate: "2026-10-21" }, po);
      const handedOver = active.find((t) => t.state === "todo" && t.assignee && !me.includes(t.assignee));
      if (handedOver) {
        handedOver.assignee = owner;
        await svc.items.updateItem({ id: handedOver.id, assigneeId: owner }, po);
      }
      // Work under way still holds up another ticket of the sprint.
      const blocker = active.find((t) => t.state !== "todo");
      const waiting = handedOver ?? active.find((t) => t.state === "todo");
      if (blocker && waiting && waiting !== blocker) {
        await svc.links.addLink({ sourceId: blocker.id, targetId: waiting.id, type: "blocks" }, po).catch(() => undefined);
      }
    });
    // Recent questions to the existing accounts, still unread this morning.
    const asks = [
      { by: po, day: "2026-10-21", time: "17:40", body: "peux-tu arbitrer la priorité de ce ticket avant le point de jeudi ?" },
      { by: people[b.spec.qa], day: "2026-10-22", time: "08:50", body: "la recette est bloquée sur ce point, j’ai besoin de ton accord pour continuer." },
      { by: people[b.spec.business], day: "2026-10-22", time: "09:20", body: "les greffières demandent si ce sera prêt pour la prochaine version." },
    ];
    const subjects = b.tasks.filter((t) => t.sprint === ACTIVE_SPRINT);
    for (const [n, ask] of asks.entries()) {
      const subject = subjects[n];
      if (!subject) break;
      await at(paris(ask.day, ask.time), () => svc.comments.addComment({
        itemId: subject.id, body: `@${names.get(owner)} ${ask.body}`, mentionIds: [owner],
      }, ask.by));
    }
  }

  /** Dates of the epics not started yet, as the product owner foresees them. */
  async function projectRoadmap(b: LiveBacklog) {
    const po = people[b.spec.po];
    let cursor = "2026-11-16";
    await at(paris("2026-10-21", "17:00"), async () => {
      for (const epic of b.epics) {
        if (epic.done || epic.start) continue;
        epic.start = cursor;
        epic.due = addDays(cursor, 39);
        cursor = addDays(cursor, 28);
        await svc.items.updateItem({ id: epic.id, startDate: epic.start, dueDate: epic.due }, po);
      }
    });
  }

  async function runKanban(b: LiveBacklog) {
    const lead = people[b.spec.po];
    const devs = b.spec.devs.map(who);
    const cursors = new Map(devs.map((dev, n) => [dev, workday(addDays("2026-07-20", n))]));
    for (const [n, t] of b.tasks.entries()) {
      // The last cards are still waiting, or under way.
      const fromEnd = b.tasks.length - n;
      if (fromEnd <= 2) continue;
      const dev = devs[n % devs.length]!;
      const startDay = cursors.get(dev)!;
      const reviewDay = workday(addDays(startDay, 4 + Math.floor(random() * 6)));
      const doneDay = workday(addDays(reviewDay, 1 + Math.floor(random() * 2)));
      cursors.set(dev, workday(addDays(doneDay, 5 + Math.floor(random() * 7))));
      if (!past(paris(startDay, "18:45"))) continue;
      t.assignee = dev;
      await at(paris(startDay, between("09:00", "10:00")), () => svc.items.updateItem({
        id: t.id, assigneeId: dev, statusId: b.status.doing, ...(chance(0.4) ? { dueDate: doneDay } : {}),
      }, lead));
      t.state = "doing";
      if (chance(0.25)) await comment(b, t, startDay);
      if (fromEnd <= 4 || !past(paris(reviewDay, "18:45"))) continue;
      await advance(b, t, "review", reviewDay, "15:00", "17:30", dev);
      if (fromEnd <= 5 || !past(paris(doneDay, "18:45"))) continue;
      await advance(b, t, "done", doneDay, "10:00", "17:00", lead);
    }
    await at(paris("2026-10-21", "17:30"), async () => {
      for (const epic of b.epics) {
        const children = b.tasks.filter((t) => t.epicId === epic.id);
        const statusId = children.every((t) => t.state === "done") ? b.status.done
          : children.some((t) => t.state !== "todo") ? b.status.doing : null;
        if (statusId) await svc.items.updateItem({ id: epic.id, statusId }, lead);
      }
    });
    log.push(`${b.spec.key} (kanban) : ${b.tasks.filter((t) => t.state === "done").length} tâches terminées sur ${b.tasks.length}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedDemoDataset().then((summary) => console.log(summary))
    .catch((error: unknown) => {
      console.error(error instanceof DemoSeedError ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => { const { databasePool } = await import("@/lib/db"); await databasePool.end(); });
}
