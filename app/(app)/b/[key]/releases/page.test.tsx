import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  getBacklogByKeyForUser: vi.fn(),
  getBacklogCapabilities: vi.fn(),
  listReleaseSummaries: vi.fn(),
  listStatusIdsByCategory: vi.fn(),
  listUsers: vi.fn(),
  notFound: vi.fn(),
  releaseListProps: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/auth/session", () => ({
  requireAppPageSession: mocks.requireSession,
}));
vi.mock("@/lib/auth/accessible-backlogs", () => ({
  getBacklogCapabilities: mocks.getBacklogCapabilities,
}));
vi.mock("@/lib/auth/authorization", () => ({
  checkPermission: mocks.checkPermission,
}));
vi.mock("@/lib/services/backlogs", () => ({
  getBacklogByKeyForUser: mocks.getBacklogByKeyForUser,
}));
vi.mock("@/lib/services/items", () => ({ listUsers: mocks.listUsers }));
vi.mock("@/lib/services/releases", () => ({
  listReleaseSummaries: mocks.listReleaseSummaries,
}));
vi.mock("@/lib/services/statuses", () => ({
  listStatusIdsByCategory: mocks.listStatusIdsByCategory,
}));
vi.mock("@/components/releases/release-list", () => ({
  ReleaseList: (props: unknown) => {
    mocks.releaseListProps(props);
    return <div>Liste versions</div>;
  },
}));

import ReleasesPage from "@/app/(app)/b/[key]/releases/page";

const backlog = {
  id: "11111111-1111-4111-8111-111111111111",
  key: "CASS",
  name: "Cassini",
  color: "#445566",
  archivedAt: null,
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

describe("releases list route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notFound.mockImplementation(() => {
      throw new Error("not-found");
    });
    mocks.requireSession.mockResolvedValue({
      user: { id: "actor-1", name: "Ada", email: "ada@example.test" },
    });
    mocks.getBacklogByKeyForUser.mockResolvedValue(backlog);
    mocks.getBacklogCapabilities.mockResolvedValue(permissions);
    mocks.checkPermission.mockResolvedValue({ allowed: true });
    mocks.listReleaseSummaries.mockResolvedValue([]);
    mocks.listStatusIdsByCategory.mockResolvedValue({
      todo: ["todo-1"],
      inProgress: ["doing-1"],
      done: ["done-1"],
    });
    mocks.listUsers.mockResolvedValue([
      { id: "actor-1", name: "Ada", email: "ada@example.test" },
      { id: "driver-2", name: "Lin", email: "lin@example.test" },
    ]);
  });

  it.each([
    { label: "missing", value: null },
    { label: "archived", value: { ...backlog, archivedAt: new Date("2026-01-01") } },
  ])("turns a $label backlog into notFound before release reads", async ({ value }) => {
    mocks.getBacklogByKeyForUser.mockResolvedValueOnce(value);

    await expect(
      ReleasesPage({ params: Promise.resolve({ key: "secret" }) }),
    ).rejects.toThrow("not-found");
    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.getBacklogByKeyForUser).toHaveBeenCalledWith("secret", "actor-1");
    expect(mocks.getBacklogCapabilities).not.toHaveBeenCalled();
    expect(mocks.listReleaseSummaries).not.toHaveBeenCalled();
  });

  it("turns a fail-closed capability lookup into notFound", async () => {
    mocks.getBacklogCapabilities.mockResolvedValueOnce(null);

    await expect(
      ReleasesPage({ params: Promise.resolve({ key: "CASS" }) }),
    ).rejects.toThrow("not-found");
    expect(mocks.listReleaseSummaries).not.toHaveBeenCalled();
  });

  it("passes only serializable minimal people and release payloads", async () => {
    mocks.listReleaseSummaries.mockResolvedValueOnce([
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Version sûre",
        description: null,
        driver: { id: "driver-2", name: "Lin" },
        startDate: null,
        targetDate: "2026-09-30",
        effectiveReleaseDate: null,
        released: false,
        archived: false,
        overdue: false,
        revision: 1,
        publicationScopeRevision: "0123456789abcdef0123456789abcdef",
        progress: {
          total: 0,
          todo: 0,
          inProgress: 0,
          done: 0,
          totalPoints: 0,
          donePoints: 0,
          unestimated: 0,
        },
      },
    ]);

    render(await ReleasesPage({
      params: Promise.resolve({ key: "cass" }),
      searchParams: Promise.resolve({}),
    }));

    expect(mocks.listReleaseSummaries).toHaveBeenCalledWith(backlog.id, {
      includeArchived: false,
    });

    expect(mocks.checkPermission).toHaveBeenCalledWith({
      actorId: "actor-1",
      permission: "browse_users",
      scope: { type: "global" },
    });
    expect(mocks.releaseListProps).toHaveBeenCalledWith({
      actor: { id: "actor-1", name: "Ada" },
      backlog: { id: backlog.id, key: "CASS", name: "Cassini" },
      canBrowseUsers: true,
      capabilities: {
        manage: true,
        assignItems: true,
        bulkAssignItems: true,
      },
      driverOptions: [
        { id: "actor-1", name: "Ada" },
        { id: "driver-2", name: "Lin" },
      ],
      releases: expect.any(Array),
      showArchived: false,
      statusIds: {
        todo: ["todo-1"],
        inProgress: ["doing-1"],
        done: ["done-1"],
      },
    });
    expect(JSON.stringify(mocks.releaseListProps.mock.calls[0]?.[0]))
      .not.toContain("@example.test");
  });

  it("includes archived releases only when the URL toggle is active", async () => {
    render(await ReleasesPage({
      params: Promise.resolve({ key: "CASS" }),
      searchParams: Promise.resolve({ archived: "1" }),
    }));

    expect(mocks.listReleaseSummaries).toHaveBeenCalledWith(backlog.id, {
      includeArchived: true,
    });
    expect(mocks.releaseListProps).toHaveBeenCalledWith(
      expect.objectContaining({ showArchived: true }),
    );
  });

  it("does not read or send the directory without browse_users", async () => {
    mocks.checkPermission.mockResolvedValueOnce({ allowed: false });

    render(await ReleasesPage({ params: Promise.resolve({ key: "CASS" }) }));

    expect(mocks.listUsers).not.toHaveBeenCalled();
    expect(mocks.releaseListProps).toHaveBeenCalledWith(
      expect.objectContaining({ canBrowseUsers: false, driverOptions: [] }),
    );
  });
});
