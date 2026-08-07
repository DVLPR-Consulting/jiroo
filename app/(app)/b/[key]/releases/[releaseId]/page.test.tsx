import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  detailProps: vi.fn(),
  getBacklogByKeyForUser: vi.fn(),
  getBacklogCapabilities: vi.fn(),
  getReleaseDetail: vi.fn(),
  listPublicationSnapshotItems: vi.fn(),
  listReleaseEvents: vi.fn(),
  listReleaseScopeItems: vi.fn(),
  listReleaseSummaries: vi.fn(),
  listStatusIdsByCategory: vi.fn(),
  listUsers: vi.fn(),
  notFound: vi.fn(),
  requireSession: vi.fn(),
  resolveReleasePublicationId: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/auth/session", () => ({ requireAppPageSession: mocks.requireSession }));
vi.mock("@/lib/auth/accessible-backlogs", () => ({
  getBacklogCapabilities: mocks.getBacklogCapabilities,
}));
vi.mock("@/lib/auth/authorization", () => ({ checkPermission: mocks.checkPermission }));
vi.mock("@/lib/services/backlogs", () => ({
  getBacklogByKeyForUser: mocks.getBacklogByKeyForUser,
}));
vi.mock("@/lib/services/items", () => ({ listUsers: mocks.listUsers }));
vi.mock("@/lib/services/statuses", () => ({
  listStatusIdsByCategory: mocks.listStatusIdsByCategory,
}));
vi.mock("@/lib/services/releases", () => ({
  getReleaseDetail: mocks.getReleaseDetail,
  listPublicationSnapshotItems: mocks.listPublicationSnapshotItems,
  listReleaseEvents: mocks.listReleaseEvents,
  listReleaseScopeItems: mocks.listReleaseScopeItems,
  listReleaseSummaries: mocks.listReleaseSummaries,
  resolveReleasePublicationId: mocks.resolveReleasePublicationId,
}));
vi.mock("@/components/releases/release-detail", () => ({
  ReleaseDetail: (props: unknown) => {
    mocks.detailProps(props);
    return <div>Détail version</div>;
  },
}));

import ReleaseDetailPage from "@/app/(app)/b/[key]/releases/[releaseId]/page";

const backlogId = "11111111-1111-4111-8111-111111111111";
const releaseId = "22222222-2222-4222-8222-222222222222";
const publicationId = "33333333-3333-4333-8333-333333333333";
const otherPublicationId = "44444444-4444-4444-8444-444444444444";
const backlog = {
  id: backlogId,
  key: "CASS",
  name: "Cassini",
  color: "#445566",
  archivedAt: null,
};
const release = {
  id: releaseId,
  name: "Version sûre",
  description: null,
  driver: { id: "driver-2", name: "Lin" },
  startDate: null,
  targetDate: "2026-09-30",
  effectiveReleaseDate: "2026-09-28",
  released: true,
  archived: false,
  overdue: false,
  revision: 4,
  publicationScopeRevision: "0123456789abcdef0123456789abcdef",
  progress: {
    total: 1,
    todo: 0,
    inProgress: 0,
    done: 1,
    totalPoints: 3,
    donePoints: 3,
    unestimated: 0,
  },
  createdAt: new Date("2026-08-01T10:00:00.000Z"),
  updatedAt: new Date("2026-08-02T10:00:00.000Z"),
};
const permissions = {
  createItems: true,
  editItems: true,
  transitionItems: true,
  scheduleItems: true,
  assignItems: true,
  deleteItems: true,
  restoreItems: true,
  addComments: true,
  editOwnComments: true,
  deleteOwnComments: true,
  deleteAllComments: true,
  linkItems: true,
  manageSprints: true,
  manageWorkflow: true,
  manageMembers: true,
  manageReleases: true,
  bulkChangeItems: true,
};

describe("release detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notFound.mockImplementation(() => { throw new Error("not-found"); });
    mocks.requireSession.mockResolvedValue({
      user: { id: "actor-1", name: "Ada", email: "ada@example.test" },
    });
    mocks.getBacklogByKeyForUser.mockResolvedValue(backlog);
    mocks.getBacklogCapabilities.mockResolvedValue(permissions);
    mocks.getReleaseDetail.mockResolvedValue(release);
    mocks.checkPermission.mockResolvedValue({ allowed: true });
    mocks.listUsers.mockResolvedValue([
      { id: "actor-1", name: "Ada", email: "ada@example.test" },
      { id: "driver-2", name: "Lin", email: "lin@example.test" },
    ]);
    mocks.listStatusIdsByCategory.mockResolvedValue({
      todo: ["todo-1"], inProgress: ["doing-1"], done: ["done-1"],
    });
    mocks.listReleaseSummaries.mockResolvedValue([
      release,
      { ...release, id: "55555555-5555-4555-8555-555555555555", name: "Version suivante", released: false },
      { ...release, id: "66666666-6666-4666-8666-666666666666", name: "Déjà publiée", released: true },
    ]);
    mocks.listReleaseScopeItems.mockResolvedValue({ rows: [], total: 0 });
    mocks.listReleaseEvents.mockResolvedValue({
      total: 2,
      rows: [
        {
          id: "event-1",
          publicationId,
          releaseName: release.name,
          actor: { id: "actor-1", name: "Ada" },
          action: "release_published",
          oldValue: { secret: "RAW-OLD" },
          newValue: { secret: "RAW-NEW" },
          requestCorrelationId: "internal-correlation",
          createdAt: new Date("2026-09-28T12:00:00.000Z"),
        },
        {
          id: "event-2",
          publicationId: null,
          releaseName: release.name,
          actor: { id: null, name: "Ancien membre" },
          action: "release_updated",
          oldValue: null,
          newValue: null,
          requestCorrelationId: null,
          createdAt: new Date("2026-09-01T12:00:00.000Z"),
        },
      ],
    });
    mocks.listPublicationSnapshotItems.mockResolvedValue({ rows: [], total: 0 });
    mocks.resolveReleasePublicationId.mockResolvedValue(publicationId);
  });

  it.each([
    { label: "missing", value: null },
    { label: "archived", value: { ...backlog, archivedAt: new Date("2026-01-01") } },
  ])("turns a $label backlog into notFound before detail reads", async ({ value }) => {
    mocks.getBacklogByKeyForUser.mockResolvedValueOnce(value);

    await expect(ReleaseDetailPage({
      params: Promise.resolve({ key: "secret", releaseId }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("not-found");
    expect(mocks.getReleaseDetail).not.toHaveBeenCalled();
    expect(mocks.listReleaseScopeItems).not.toHaveBeenCalled();
  });

  it("rejects a malformed release route parameter before database reads", async () => {
    await expect(ReleaseDetailPage({
      params: Promise.resolve({ key: "CASS", releaseId: "not-a-uuid" }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("not-found");

    expect(mocks.getBacklogByKeyForUser).not.toHaveBeenCalled();
    expect(mocks.getReleaseDetail).not.toHaveBeenCalled();
  });

  it("turns a missing release or fail-closed capability lookup into notFound", async () => {
    mocks.getReleaseDetail.mockResolvedValueOnce(null);
    await expect(ReleaseDetailPage({
      params: Promise.resolve({ key: "CASS", releaseId }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("not-found");
    expect(mocks.listReleaseScopeItems).not.toHaveBeenCalled();

    mocks.getBacklogCapabilities.mockResolvedValueOnce(null);
    await expect(ReleaseDetailPage({
      params: Promise.resolve({ key: "CASS", releaseId }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("not-found");
  });

  it("awaits pagination params and reads one selected visible publication snapshot", async () => {
    render(await ReleaseDetailPage({
      params: Promise.resolve({ key: "cass", releaseId }),
      searchParams: Promise.resolve({
        scopePage: "2",
        scopeStatus: "in_progress",
        scopeEstimate: "unestimated",
        eventPage: "3",
        snapshot: publicationId,
        snapshotPage: "4",
      }),
    }));

    expect(mocks.listReleaseScopeItems).toHaveBeenCalledWith({
      backlogId,
      releaseId,
      page: 2,
      pageSize: 20,
      statusCategory: "in_progress",
      estimate: "unestimated",
    });
    expect(mocks.listReleaseEvents).toHaveBeenCalledWith({
      backlogId, releaseId, page: 3, pageSize: 20,
    });
    expect(mocks.listPublicationSnapshotItems).toHaveBeenCalledOnce();
    expect(mocks.listPublicationSnapshotItems).toHaveBeenCalledWith({
      backlogId, publicationId, page: 4, pageSize: 20,
    });
  });

  it("ignores invalid scope filters", async () => {
    render(await ReleaseDetailPage({
      params: Promise.resolve({ key: "CASS", releaseId }),
      searchParams: Promise.resolve({ scopeStatus: "secret", scopeEstimate: "huge" }),
    }));

    expect(mocks.listReleaseScopeItems).toHaveBeenCalledWith({
      backlogId,
      releaseId,
      page: 1,
      pageSize: 20,
      statusCategory: null,
      estimate: null,
    });
    expect(mocks.detailProps).toHaveBeenCalledWith(
      expect.objectContaining({ scopeFilters: { statusCategory: null, estimate: null } }),
    );
  });

  it("ignores a forged snapshot ID and loads the latest visible publication once", async () => {
    render(await ReleaseDetailPage({
      params: Promise.resolve({ key: "CASS", releaseId }),
      searchParams: Promise.resolve({ snapshot: otherPublicationId }),
    }));

    expect(mocks.listPublicationSnapshotItems).toHaveBeenCalledOnce();
    expect(mocks.listPublicationSnapshotItems).toHaveBeenCalledWith({
      backlogId, publicationId, page: 1, pageSize: 20,
    });
    expect(mocks.resolveReleasePublicationId).toHaveBeenCalledWith({
      backlogId,
      releaseId,
      preferredPublicationId: otherPublicationId,
    });
  });

  it("loads a validated older publication even when it is outside the current event page", async () => {
    mocks.resolveReleasePublicationId.mockResolvedValueOnce(otherPublicationId);

    render(await ReleaseDetailPage({
      params: Promise.resolve({ key: "CASS", releaseId }),
      searchParams: Promise.resolve({ snapshot: otherPublicationId, snapshotPage: "2" }),
    }));

    expect(mocks.listPublicationSnapshotItems).toHaveBeenCalledOnce();
    expect(mocks.listPublicationSnapshotItems).toHaveBeenCalledWith({
      backlogId, publicationId: otherPublicationId, page: 2, pageSize: 20,
    });
  });

  it("projects a serializable payload without emails or raw event JSON", async () => {
    render(await ReleaseDetailPage({
      params: Promise.resolve({ key: "CASS", releaseId }),
      searchParams: Promise.resolve({}),
    }));

    const props = mocks.detailProps.mock.calls[0]?.[0];
    expect(props).toEqual(expect.objectContaining({
      actor: { id: "actor-1", name: "Ada" },
      events: {
        page: 1,
        total: 2,
        rows: [
          {
            id: "event-1",
            publicationId,
            actorName: "Ada",
            action: "release_published",
            createdAt: "2026-09-28T12:00:00.000Z",
          },
          {
            id: "event-2",
            publicationId: null,
            actorName: "Ancien membre",
            action: "release_updated",
            createdAt: "2026-09-01T12:00:00.000Z",
          },
        ],
      },
      driverOptions: [
        { id: "actor-1", name: "Ada" },
        { id: "driver-2", name: "Lin" },
      ],
      destinations: [
        { id: "55555555-5555-4555-8555-555555555555", name: "Version suivante" },
      ],
    }));
    const serialized = JSON.stringify(props);
    expect(serialized).not.toContain("@example.test");
    expect(serialized).not.toContain("RAW-OLD");
    expect(serialized).not.toContain("RAW-NEW");
    expect(serialized).not.toContain("internal-correlation");
  });
});
