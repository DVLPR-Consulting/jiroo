import "dotenv/config";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, items, statuses } from "@/lib/db/schema/domain";
import { STATUS_CATEGORY } from "@/lib/design/constants";
import { nextItemKey } from "@/lib/items/key";
import { rankLast } from "@/lib/tree/rank";

const STATUS_SEED = [
  { id: "todo", name: "À faire", color: "#9aa0a6" },
  { id: "doing", name: "En cours", color: "#d99a2b" },
  { id: "review", name: "En revue", color: "#8b5cf6" },
  { id: "done", name: "Terminé", color: "#3aa675" },
] as const;

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL!;
  const password = process.env.SEED_ADMIN_PASSWORD!;
  const name = process.env.SEED_ADMIN_NAME ?? "Administrateur";

  // 1) Admin via better-auth (idempotent-ish: ignore "already exists").
  await auth.api
    .signUpEmail({ body: { email, password, name } })
    .catch((e) => console.warn("admin signup skipped:", String(e)));
  await db.update(user).set({ role: "admin" }).where(eq(user.email, email));
  const [admin] = await db.select().from(user).where(eq(user.email, email));
  if (!admin) throw new Error("seed: admin not found after signup");

  // 2) CASS backlog (skip if present).
  const existing = await db.select().from(backlogs).where(eq(backlogs.key, "CASS"));
  if (existing.length > 0) {
    console.log("seed: CASS backlog already present, skipping item seed");
    return;
  }
  // nextval is non-transactional (sequence values don't roll back), so
  // precompute the three item keys before opening the transaction.
  const composantKey = await nextItemKey(db, "CASS");
  const epicKey = await nextItemKey(db, "CASS");
  const tacheKey = await nextItemKey(db, "CASS");

  // 3) Backlog, statuses and a valid demo tree (composant > epic > tache),
  // inserted atomically so it's all-or-nothing.
  await db.transaction(async (tx) => {
    const [backlog] = await tx
      .insert(backlogs)
      .values({ key: "CASS", name: "Cour de cassation", color: "#7c3030" })
      .returning();

    const insertedStatuses = await tx
      .insert(statuses)
      .values(
        STATUS_SEED.map((s, i) => ({
          backlogId: backlog!.id,
          name: s.name,
          category: STATUS_CATEGORY[s.id],
          order: i,
          color: s.color,
        })),
      )
      .returning();
    const todo = insertedStatuses.find((s) => s.order === 0)!;

    const [composant] = await tx
      .insert(items)
      .values({
        key: composantKey,
        type: "composant",
        backlogId: backlog!.id,
        title: "Authentification",
        statusId: todo.id,
        reporterId: admin.id,
        rank: rankLast(null),
        path: "root",
        depth: 0,
      })
      .returning();

    const [epic] = await tx
      .insert(items)
      .values({
        key: epicKey,
        type: "epic",
        backlogId: backlog!.id,
        title: "2FA TOTP",
        statusId: todo.id,
        reporterId: admin.id,
        parentId: composant!.id,
        rank: rankLast(null),
        path: `root.${composant!.id.replace(/-/g, "")}`,
        depth: 1,
      })
      .returning();

    await tx.insert(items).values({
      key: tacheKey,
      type: "tache",
      backlogId: backlog!.id,
      title: "Écran de vérification du code",
      statusId: todo.id,
      reporterId: admin.id,
      parentId: epic!.id,
      rank: rankLast(null),
      path: `root.${composant!.id.replace(/-/g, "")}.${epic!.id.replace(/-/g, "")}`,
      depth: 2,
    });
  });

  console.log(`seed: created admin ${email}, backlog CASS, 4 statuses, 3 demo items`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
