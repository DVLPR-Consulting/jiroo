import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, views } from "@/lib/db/schema/domain";
import {
  deleteView,
  getViewById,
  renameView,
  setShared,
  updateView,
} from "@/lib/services/views";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const fixtureId = randomUUID();
const ownerId = `views-owner-${fixtureId}`;
const managerId = `views-manager-${fixtureId}`;

let backlogId = "";
let viewId = "";

const viewState = {
  displayMode: "board" as const,
  filters: {
    q: "",
    types: [],
    statusIds: [],
    priorities: [],
    assignees: [],
    labels: [],
    kind: [],
    underIds: [],
  },
  group: null,
  sort: null,
};

describeDb("shared view mutation override", () => {
  beforeAll(async () => {
    await db.insert(user).values([
      {
        id: ownerId,
        name: "Propriétaire vue",
        email: `${ownerId}@example.test`,
        emailVerified: true,
        role: "contributor",
      },
      {
        id: managerId,
        name: "Gestionnaire vue",
        email: `${managerId}@example.test`,
        emailVerified: true,
        role: "contributor",
      },
    ]);
    const [backlog] = await db
      .insert(backlogs)
      .values({ key: `V${fixtureId.replaceAll("-", "").slice(0, 5)}`.toUpperCase(), name: "Views" })
      .returning({ id: backlogs.id });
    backlogId = backlog!.id;
  });

  beforeEach(async () => {
    const [view] = await db
      .insert(views)
      .values({
        name: "Vue partagée",
        ownerId,
        backlogId,
        shared: true,
      })
      .returning({ id: views.id });
    viewId = view!.id;
  });

  afterEach(async () => {
    if (viewId) await db.delete(views).where(eq(views.id, viewId));
    viewId = "";
  });

  afterAll(async () => {
    if (backlogId) await db.delete(backlogs).where(eq(backlogs.id, backlogId));
    await db.delete(user).where(inArray(user.id, [ownerId, managerId]));
  });

  it.each([
    {
      operation: "update",
      mutate: () => updateView(viewId, viewState, managerId, { allowAny: true }),
    },
    {
      operation: "rename",
      mutate: () => renameView(viewId, { name: "Renommée" }, managerId, { allowAny: true }),
    },
    {
      operation: "share",
      mutate: () => setShared(viewId, { shared: true }, managerId, { allowAny: true }),
    },
    {
      operation: "delete",
      mutate: () => deleteView(viewId, managerId, { allowAny: true }),
    },
  ])(
    "rejects a stale shared proof before $operation when the locked row became private",
    async ({ mutate }) => {
      const staleProof = await getViewById(viewId);
      expect(staleProof).toMatchObject({ shared: true, ownerId });

      await db.update(views).set({ shared: false }).where(eq(views.id, viewId));

      await expect(mutate()).rejects.toThrow(
        "Action réservée au propriétaire de la vue.",
      );
      await expect(getViewById(viewId)).resolves.toMatchObject({
        shared: false,
        ownerId,
      });
    },
  );
});
