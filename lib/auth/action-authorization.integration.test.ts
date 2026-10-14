import "dotenv/config";

import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  requireBacklogPermissionById,
  requireBacklogPermissionByKey,
  requireBacklogReadPermissionById,
  requireCommentPermission,
  requireItemPermission,
  requireLinkPermission,
  requireRefPermission,
  requireSprintPermission,
  requireStatusPermission,
  requireViewMutationPermission,
  requireViewPermission,
  requireWebLinkPermission,
} from "@/lib/auth/action-authorization";
import { mapActionAuthorizationError } from "@/lib/auth/action-error";
import {
  PermissionDeniedError,
  ResourceNotFoundError,
} from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  backlogPermissionConfigs,
  backlogs,
  comments,
  itemLinks,
  itemRefs,
  items,
  itemWebLinks,
  permissionGrants,
  permissionSchemes,
  sprints,
  statuses,
  views,
} from "@/lib/db/schema/domain";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const fixtureId = randomUUID();
const actorId = `ownership-actor-${fixtureId}`;
const browseOnlyActorId = `ownership-browser-${fixtureId}`;
const slug = fixtureId.replaceAll("-", "");

let backlogA: { id: string; key: string };
let backlogB: { id: string; key: string };
let schemeIds: string[] = [];
let itemAId = "";
let itemBId = "";
let sprintAId = "";
let sprintBId = "";
let statusAId = "";
let statusBId = "";
let viewAId = "";
let viewBId = "";
let commentAId = "";
let otherCommentAId = "";
let linkAId = "";
let crossBacklogLinkId = "";
let refAId = "";
let webLinkAId = "";
let sharedViewAId = "";
let privateOtherViewAId = "";

describeDb("ownership-aware authorization helpers", () => {
  beforeAll(async () => {
    await db.insert(user).values([
      {
        id: actorId,
        name: "Membre du backlog A",
        email: `${actorId}@example.test`,
        emailVerified: true,
        role: "contributor",
      },
      {
        id: browseOnlyActorId,
        name: "Lecteur du backlog B",
        email: `${browseOnlyActorId}@example.test`,
        emailVerified: true,
        role: "contributor",
      },
    ]);

    const [createdA, createdB] = await db
      .insert(backlogs)
      .values([
        { key: `O${slug.slice(0, 5)}`.toUpperCase(), name: "Ownership A" },
        { key: `P${slug.slice(5, 10)}`.toUpperCase(), name: "Ownership B" },
      ])
      .returning({ id: backlogs.id, key: backlogs.key });
    backlogA = createdA!;
    backlogB = createdB!;

    const schemes = await db
      .insert(permissionSchemes)
      .values([
        { key: `ownership-scheme-a-${fixtureId}`, name: "Ownership A" },
        { key: `ownership-scheme-b-${fixtureId}`, name: "Ownership B" },
      ])
      .returning({ id: permissionSchemes.id });
    schemeIds = schemes.map((scheme) => scheme.id);

    await db.insert(backlogPermissionConfigs).values([
      { backlogId: backlogA.id, permissionSchemeId: schemeIds[0]! },
      { backlogId: backlogB.id, permissionSchemeId: schemeIds[1]! },
    ]);
    await db.insert(permissionGrants).values(
      [
        "browse_backlog",
        "edit_items",
        "manage_sprints",
        "manage_workflows",
        "manage_shared_views",
        "edit_own_comments",
        "delete_own_comments",
        "delete_all_comments",
        "link_items",
      ].map((permissionKey) => ({
        scope: "backlog" as const,
        permissionSchemeId: schemeIds[0]!,
        permissionKey,
        principalType: "user" as const,
        userId: actorId,
      })),
    );
    await db.insert(permissionGrants).values({
      scope: "backlog",
      permissionSchemeId: schemeIds[1]!,
      permissionKey: "browse_backlog",
      principalType: "user",
      userId: browseOnlyActorId,
    });

    const [createdStatusA, createdStatusB] = await db
      .insert(statuses)
      .values([
        {
          backlogId: backlogA.id,
          name: "À faire A",
          category: "todo",
          order: 0,
          color: "#9aa0a6",
        },
        {
          backlogId: backlogB.id,
          name: "À faire B",
          category: "todo",
          order: 0,
          color: "#9aa0a6",
        },
      ])
      .returning({ id: statuses.id });
    statusAId = createdStatusA!.id;
    statusBId = createdStatusB!.id;

    itemAId = randomUUID();
    const secondItemAId = randomUUID();
    itemBId = randomUUID();
    await db.insert(items).values([
      {
        id: itemAId,
        key: `${backlogA.key}-1`,
        type: "composant",
        backlogId: backlogA.id,
        title: "Item A",
        statusId: statusAId,
        reporterId: actorId,
        rank: "a0",
        path: `root.${itemAId.replaceAll("-", "")}`,
      },
      {
        id: secondItemAId,
        key: `${backlogA.key}-2`,
        type: "composant",
        backlogId: backlogA.id,
        title: "Second item A",
        statusId: statusAId,
        reporterId: actorId,
        rank: "a1",
        path: `root.${secondItemAId.replaceAll("-", "")}`,
      },
      {
        id: itemBId,
        key: `${backlogB.key}-1`,
        type: "composant",
        backlogId: backlogB.id,
        title: "Item B",
        statusId: statusBId,
        reporterId: actorId,
        rank: "a0",
        path: `root.${itemBId.replaceAll("-", "")}`,
      },
    ]);

    const [createdCommentA, createdOtherCommentA] = await db
      .insert(comments)
      .values([
        { itemId: itemAId, authorId: actorId, body: "Commentaire propriétaire" },
        { itemId: itemAId, authorId: browseOnlyActorId, body: "Commentaire tiers" },
      ])
      .returning({ id: comments.id });
    commentAId = createdCommentA!.id;
    otherCommentAId = createdOtherCommentA!.id;

    const [createdLinkA, createdCrossBacklogLink] = await db
      .insert(itemLinks)
      .values([
        { sourceId: itemAId, targetId: secondItemAId, type: "relates", createdBy: actorId },
        { sourceId: itemAId, targetId: itemBId, type: "relates", createdBy: actorId },
      ])
      .returning({ id: itemLinks.id });
    linkAId = createdLinkA!.id;
    crossBacklogLinkId = createdCrossBacklogLink!.id;
    const [createdRefA] = await db
      .insert(itemRefs)
      .values({
        itemId: itemAId,
        url: "https://github.com/openai/openai-node/pull/1",
        kind: "pr",
        createdBy: actorId,
      })
      .returning({ id: itemRefs.id });
    refAId = createdRefA!.id;
    const [createdWebLinkA] = await db
      .insert(itemWebLinks)
      .values({ itemId: itemAId, url: "https://www.figma.com/design/abc", createdBy: actorId })
      .returning({ id: itemWebLinks.id });
    webLinkAId = createdWebLinkA!.id;

    const [createdSprintA, createdSprintB] = await db
      .insert(sprints)
      .values([
        { backlogId: backlogA.id, name: "Sprint A", rank: "a0", createdBy: actorId },
        { backlogId: backlogB.id, name: "Sprint B", rank: "a0", createdBy: actorId },
      ])
      .returning({ id: sprints.id });
    sprintAId = createdSprintA!.id;
    sprintBId = createdSprintB!.id;

    const [createdViewA, createdViewB, createdSharedViewA, createdPrivateOtherViewA] = await db
      .insert(views)
      .values([
        { name: "Vue A", ownerId: actorId, backlogId: backlogA.id },
        { name: "Vue B", ownerId: actorId, backlogId: backlogB.id },
        {
          name: "Vue A partagée",
          ownerId: browseOnlyActorId,
          backlogId: backlogA.id,
          shared: true,
        },
        { name: "Vue A privée tierce", ownerId: browseOnlyActorId, backlogId: backlogA.id },
      ])
      .returning({ id: views.id });
    viewAId = createdViewA!.id;
    viewBId = createdViewB!.id;
    sharedViewAId = createdSharedViewA!.id;
    privateOtherViewAId = createdPrivateOtherViewA!.id;
  });

  afterAll(async () => {
    if (backlogA && backlogB) {
      await db.delete(backlogs).where(inArray(backlogs.id, [backlogA.id, backlogB.id]));
    }
    if (schemeIds.length > 0) {
      await db.delete(permissionSchemes).where(inArray(permissionSchemes.id, schemeIds));
    }
    await db.delete(user).where(inArray(user.id, [actorId, browseOnlyActorId]));
  });

  it("resolves backlog authorization by stored ID and normalized key", async () => {
    await expect(
      requireBacklogPermissionById({
        actorId,
        backlogId: backlogA.id,
        permission: "edit_items",
      }),
    ).resolves.toMatchObject({
      backlogId: backlogA.id,
      backlogKey: backlogA.key,
      resourceId: backlogA.id,
    });

    await expect(
      requireBacklogPermissionByKey({
        actorId,
        backlogKey: backlogA.key.toLowerCase(),
        permission: "edit_items",
      }),
    ).resolves.toMatchObject({
      backlogId: backlogA.id,
      backlogKey: backlogA.key,
      resourceId: backlogA.id,
    });
  });

  it("maps inaccessible and absent backlog IDs to the same action-boundary result", async () => {
    const mapRejection = async (backlogId: string) => {
      try {
        await requireBacklogPermissionById({
          actorId,
          backlogId,
          permission: "manage_releases",
        });
        throw new Error("Expected backlog authorization to fail.");
      } catch (error) {
        return mapActionAuthorizationError(error);
      }
    };

    await expect(
      Promise.all([mapRejection(backlogB.id), mapRejection(randomUUID())]),
    ).resolves.toEqual([
      { ok: false, error: "La ressource demandée est introuvable." },
      { ok: false, error: "La ressource demandée est introuvable." },
    ]);
  });

  it("authorizes an item from its stored backlog and ignores a forged backlog key", async () => {
    await expect(
      requireItemPermission({ actorId, itemId: itemAId, permission: "edit_items" }),
    ).resolves.toMatchObject({ backlogId: backlogA.id, resourceId: itemAId });

    await expect(
      requireItemPermission({
        actorId,
        itemId: itemBId,
        permission: "edit_items",
        backlogKey: backlogA.key,
      } as Parameters<typeof requireItemPermission>[0] & { backlogKey: string }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("resolves sprint, status, and saved-view ownership before checking permission", async () => {
    await expect(
      requireSprintPermission({ actorId, sprintId: sprintAId, permission: "manage_sprints" }),
    ).resolves.toMatchObject({ backlogId: backlogA.id, resourceId: sprintAId });
    await expect(
      requireStatusPermission({ actorId, statusId: statusAId, permission: "manage_workflows" }),
    ).resolves.toMatchObject({ backlogId: backlogA.id, resourceId: statusAId });
    await expect(
      requireViewPermission({ actorId, viewId: viewAId, permission: "manage_shared_views" }),
    ).resolves.toMatchObject({ backlogId: backlogA.id, resourceId: viewAId });

    await expect(
      requireSprintPermission({
        actorId,
        sprintId: sprintBId,
        permission: "manage_sprints",
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(
      requireStatusPermission({
        actorId,
        statusId: statusBId,
        permission: "manage_workflows",
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(
      requireViewPermission({
        actorId,
        viewId: viewBId,
        permission: "manage_shared_views",
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("resolves comment ownership before selecting own or all comment permission", async () => {
    await expect(
      requireCommentPermission({
        actorId,
        commentId: commentAId,
        ownPermission: "edit_own_comments",
      }),
    ).resolves.toMatchObject({
      backlogId: backlogA.id,
      resourceId: commentAId,
      authorId: actorId,
    });

    await expect(
      requireCommentPermission({
        actorId,
        commentId: otherCommentAId,
        ownPermission: "delete_own_comments",
        otherPermission: "delete_all_comments",
      }),
    ).resolves.toMatchObject({ authorId: browseOnlyActorId });

    await expect(
      requireCommentPermission({
        actorId,
        commentId: otherCommentAId,
        ownPermission: "edit_own_comments",
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("resolves stored link and reference ownership", async () => {
    await expect(
      requireLinkPermission({ actorId, linkId: linkAId, permission: "link_items" }),
    ).resolves.toMatchObject({ backlogId: backlogA.id, resourceId: linkAId });
    await expect(
      requireRefPermission({ actorId, refId: refAId, permission: "link_items" }),
    ).resolves.toMatchObject({ backlogId: backlogA.id, resourceId: refAId });
    await expect(
      requireWebLinkPermission({ actorId, webLinkId: webLinkAId, permission: "link_items" }),
    ).resolves.toMatchObject({ backlogId: backlogA.id, resourceId: webLinkAId });
    await expect(
      requireWebLinkPermission({ actorId, webLinkId: randomUUID(), permission: "link_items" }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("hides a malformed link whose stored endpoints cross backlogs", async () => {
    await expect(
      requireLinkPermission({
        actorId,
        linkId: crossBacklogLinkId,
        permission: "link_items",
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("keeps personal views owner-scoped while shared views use manage_shared_views", async () => {
    await expect(
      requireViewMutationPermission({ actorId, viewId: viewAId }),
    ).resolves.toMatchObject({ ownerId: actorId, shared: false });
    await expect(
      requireViewMutationPermission({ actorId, viewId: sharedViewAId }),
    ).resolves.toMatchObject({ ownerId: browseOnlyActorId, shared: true });
    await expect(
      requireViewMutationPermission({ actorId, viewId: privateOtherViewAId }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("hides every existing resource when its backlog cannot be browsed", async () => {
    await expect(
      requireBacklogReadPermissionById({
        actorId,
        backlogId: backlogB.id,
        permission: "browse_backlog",
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(
      requireBacklogPermissionById({
        actorId,
        backlogId: backlogB.id,
        permission: "edit_items",
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(
      requireBacklogPermissionByKey({
        actorId,
        backlogKey: backlogB.key,
        permission: "edit_items",
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(
      requireItemPermission({ actorId, itemId: itemBId, permission: "edit_items" }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(
      requireSprintPermission({
        actorId,
        sprintId: sprintBId,
        permission: "manage_sprints",
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(
      requireStatusPermission({
        actorId,
        statusId: statusBId,
        permission: "manage_workflows",
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(
      requireViewPermission({
        actorId,
        viewId: viewBId,
        permission: "manage_shared_views",
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("keeps action denial distinct after browse access has been established", async () => {
    await expect(
      requireBacklogPermissionById({
        actorId: browseOnlyActorId,
        backlogId: backlogB.id,
        permission: "edit_items",
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(
      requireItemPermission({
        actorId: browseOnlyActorId,
        itemId: itemBId,
        permission: "edit_items",
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(
      requireSprintPermission({
        actorId: browseOnlyActorId,
        sprintId: sprintBId,
        permission: "manage_sprints",
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(
      requireStatusPermission({
        actorId: browseOnlyActorId,
        statusId: statusBId,
        permission: "manage_workflows",
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(
      requireViewPermission({
        actorId: browseOnlyActorId,
        viewId: viewBId,
        permission: "manage_shared_views",
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("returns typed not-found errors for every absent resource", async () => {
    await expect(
      requireBacklogReadPermissionById({
        actorId,
        backlogId: randomUUID(),
        permission: "browse_backlog",
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(
      requireBacklogPermissionByKey({
        actorId,
        backlogKey: `Z${slug.slice(0, 5)}`,
        permission: "browse_backlog",
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(
      requireItemPermission({ actorId, itemId: randomUUID(), permission: "edit_items" }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(
      requireSprintPermission({ actorId, sprintId: randomUUID(), permission: "manage_sprints" }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(
      requireStatusPermission({ actorId, statusId: randomUUID(), permission: "manage_workflows" }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(
      requireViewPermission({ actorId, viewId: randomUUID(), permission: "manage_shared_views" }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
