import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  burndownReportProps: vi.fn(),
  getBurndownReport: vi.fn(),
  getBacklogByKeyForUser: vi.fn(),
  getBacklogCapabilities: vi.fn(),
  getSprintReport: vi.fn(),
  getVelocityReport: vi.fn(),
  listReportableSprints: vi.fn(),
  navigationProps: vi.fn(),
  notFound: vi.fn(),
  requireSession: vi.fn(),
  sprintReportProps: vi.fn(),
  velocityReportProps: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/auth/session", () => ({
  requireAppPageSession: mocks.requireSession,
}));
vi.mock("@/lib/auth/accessible-backlogs", () => ({
  getBacklogCapabilities: mocks.getBacklogCapabilities,
}));
vi.mock("@/lib/services/backlogs", () => ({
  getBacklogByKeyForUser: mocks.getBacklogByKeyForUser,
}));
vi.mock("@/lib/services/sprint-reports", () => ({
  getSprintReport: mocks.getSprintReport,
  getVelocityReport: mocks.getVelocityReport,
  listReportableSprints: mocks.listReportableSprints,
}));
vi.mock("@/lib/services/sprint-burndown", () => ({
  getBurndownReport: mocks.getBurndownReport,
}));
vi.mock("@/components/reports/burndown-report", () => ({
  BurndownReportView: (props: unknown) => {
    mocks.burndownReportProps(props);
    return <div>Rapport burndown</div>;
  },
}));
vi.mock("@/components/reports/report-navigation", () => ({
  ReportNavigation: (props: unknown) => {
    mocks.navigationProps(props);
    return <div>Navigation rapports</div>;
  },
}));
vi.mock("@/components/reports/sprint-report", () => ({
  SprintReportView: (props: unknown) => {
    mocks.sprintReportProps(props);
    return <div>Rapport sprint</div>;
  },
}));
vi.mock("@/components/reports/velocity-report", () => ({
  VelocityReportView: (props: unknown) => {
    mocks.velocityReportProps(props);
    return <div>Rapport vélocité</div>;
  },
}));

import ReportsPage from "@/app/(app)/b/[key]/reports/page";

const activeId = "11111111-1111-4111-8111-111111111111";
const completedId = "22222222-2222-4222-8222-222222222222";
const backlog = {
  id: "33333333-3333-4333-8333-333333333333",
  key: "CASS",
  name: "Cassini",
  archivedAt: null,
};
const activeSprint = {
  id: activeId,
  name: "Sprint actif",
  goal: null,
  state: "active" as const,
  startedAt: new Date("2026-08-01T09:00:00.000Z"),
  completedAt: null,
  hasSnapshot: false,
};
const completedSprint = {
  id: completedId,
  name: "Sprint terminé",
  goal: null,
  state: "completed" as const,
  startedAt: new Date("2026-07-01T09:00:00.000Z"),
  completedAt: new Date("2026-07-15T09:00:00.000Z"),
  hasSnapshot: true,
};

const report = {
  kind: "active" as const,
  statusLabel: "Données en cours" as const,
  sprint: {
    id: activeId,
    name: "Sprint actif",
    goal: null,
    plannedStartAt: new Date("2026-08-01T08:00:00.000Z"),
    plannedEndAt: null,
    startedAt: new Date("2026-08-01T09:00:00.000Z"),
    completedAt: null,
  },
  metrics: {
    initialItemCount: 1,
    committedPoints: 5,
    initialUnestimatedCount: 0,
    currentItemCount: 1,
    currentScopePoints: 8,
    currentUnestimatedCount: 0,
    completedItemCount: 0,
    completedPoints: 0,
    grossPointsAdded: 0,
    grossPointsRemoved: 0,
    netEstimateDelta: 3,
    scopeEventCount: 1,
  },
  sections: { completed: 0, incomplete: 1, removed: 0, carried: 0 },
  items: {
    page: 2,
    pageSize: 50,
    total: 1,
    rows: [{
      itemId: "44444444-4444-4444-8444-444444444444",
      itemKey: "CASS-1",
      itemTitle: "Paiement",
      itemType: "tache" as const,
      itemKind: "feature" as const,
      firstJoinedAt: new Date("2026-08-01T09:00:00.000Z"),
      finalLeftAt: null,
      initialCommitment: true,
      addedAfterStart: false,
      removedAfterStart: false,
      estimateAtStart: 5,
      estimateAtFinalParticipation: 8,
      estimateAtCompletion: null,
      statusCategory: "in_progress" as const,
      outcome: "incomplete" as const,
      destinationSprint: null,
      section: "incomplete" as const,
    }],
  },
  events: {
    page: 3,
    pageSize: 50,
    total: 1,
    rows: [{
      id: "55555555-5555-4555-8555-555555555555",
      sequence: BigInt(9),
      eventType: "estimate_changed" as const,
      occurredAt: new Date("2026-08-02T09:00:00.000Z"),
      actor: { id: "actor-1", name: "Ada" },
      itemId: "44444444-4444-4444-8444-444444444444",
      itemKey: "CASS-1",
      itemTitle: "Paiement",
      previousEstimate: 5,
      nextEstimate: 8,
      previousDone: null,
      nextDone: null,
      relatedSprint: null,
      removalReason: null,
    }],
  },
};

const burndownPoint = {
  occurredAt: new Date("2026-08-02T09:00:00.000Z"),
  sequence: BigInt("9007199254740993"),
  remainingPoints: 8,
  unestimatedCount: 0,
  deltaPoints: 3,
  itemId: "44444444-4444-4444-8444-444444444444",
  itemKey: "CASS-1",
  itemTitle: "Paiement",
  cause: "estimate_changed" as const,
};
const burndownBaseline = {
  ...burndownPoint,
  occurredAt: new Date("2026-08-01T09:00:00.000Z"),
  sequence: null,
  remainingPoints: 5,
  deltaPoints: 0,
  itemId: null,
  itemKey: null,
  itemTitle: null,
  cause: "start" as const,
};
const burndown = {
  kind: "active" as const,
  sprint: {
    id: activeId,
    name: "Sprint actif",
    goal: null,
    plannedStartAt: new Date("2026-08-01T08:00:00.000Z"),
    plannedEndAt: new Date("2026-08-15T09:00:00.000Z"),
    startedAt: new Date("2026-08-01T09:00:00.000Z"),
    completedAt: null,
  },
  summary: {
    initialRemainingPoints: 5,
    remainingPoints: 8,
    completedPoints: 0,
    unestimatedCount: 0,
  },
  trajectory: {
    label: "Au-dessus de la trajectoire idéale" as const,
    insufficientReason: null,
  },
  planningComparison: {
    state: "ready" as const,
    commitmentPoints: 5,
    averageCompletedPoints: 4,
    population: 3,
    difference: 1,
  },
  guideline: {
    state: "available" as const,
    points: [
      { occurredAt: new Date("2026-08-01T09:00:00.000Z"), remainingPoints: 5 },
      { occurredAt: new Date("2026-08-15T09:00:00.000Z"), remainingPoints: 0 },
    ],
  },
  displayPoints: [burndownBaseline, burndownPoint],
  baseline: burndownBaseline,
  observedAt: new Date("2026-08-03T09:00:00.000Z"),
  eventPoints: { page: 2, pageSize: 50, total: 51, rows: [burndownPoint] },
  events: {
    ...report.events,
    page: 2,
    total: 51,
    rows: [{ ...report.events.rows[0]!, sequence: BigInt("9007199254740993") }],
  },
};

describe("reports route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notFound.mockImplementation(() => {
      throw new Error("not-found");
    });
    mocks.requireSession.mockResolvedValue({ user: { id: "actor-1" } });
    mocks.getBacklogByKeyForUser.mockResolvedValue(backlog);
    mocks.getBacklogCapabilities.mockResolvedValue({ browse: true });
    mocks.listReportableSprints.mockResolvedValue({
      sprints: [activeSprint, completedSprint],
      plannedCount: 0,
    });
    mocks.getSprintReport.mockResolvedValue(report);
    mocks.getBurndownReport.mockResolvedValue(burndown);
    mocks.getVelocityReport.mockResolvedValue({
      state: "empty",
      label: "Pas encore de vélocité",
      limit: 7,
      bars: [],
      population: 0,
      averageCompletedPoints: null,
    });
  });

  it.each(["not-a-uuid", ""])(
    "conceals malformed sprint %j before session and report reads",
    async (sprint) => {
    await expect(ReportsPage({
      params: Promise.resolve({ key: "CASS" }),
      searchParams: Promise.resolve({ sprint }),
    })).rejects.toThrow("not-found");

    expect(mocks.requireSession).not.toHaveBeenCalled();
    expect(mocks.getSprintReport).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["missing", null],
    ["archived", { ...backlog, archivedAt: new Date("2026-08-01") }],
  ])("conceals a %s backlog before report reads", async (_label, value) => {
    mocks.getBacklogByKeyForUser.mockResolvedValueOnce(value);

    await expect(ReportsPage({ params: Promise.resolve({ key: "secret" }) }))
      .rejects.toThrow("not-found");

    expect(mocks.getBacklogByKeyForUser).toHaveBeenCalledWith("secret", "actor-1");
    expect(mocks.getBacklogCapabilities).not.toHaveBeenCalled();
    expect(mocks.listReportableSprints).not.toHaveBeenCalled();
  });

  it("conceals a fail-closed capability lookup", async () => {
    mocks.getBacklogCapabilities.mockResolvedValueOnce(null);

    await expect(ReportsPage({ params: Promise.resolve({ key: "CASS" }) }))
      .rejects.toThrow("not-found");

    expect(mocks.listReportableSprints).not.toHaveBeenCalled();
  });

  it("selects the active sprint, keeps viewer data complete, and serializes dates and bigint", async () => {
    const { container } = render(await ReportsPage({
      params: Promise.resolve({ key: "cass" }),
      searchParams: Promise.resolve({ itemPage: "2", eventPage: "3" }),
    }));

    expect(screen.getByText("Rapport sprint")).toBeVisible();
    expect(container.querySelector("main")).toBeNull();
    expect(mocks.getSprintReport).toHaveBeenCalledWith(backlog.id, activeId, {
      itemPage: 2,
      eventPage: 3,
      pageSize: 50,
    });
    expect(mocks.navigationProps).toHaveBeenCalledWith({
      backlogKey: "CASS",
      report: "sprint",
      selectedSprintId: activeId,
      plannedCount: 0,
      sprints: [
        { id: activeId, name: "Sprint actif", state: "active", hasSnapshot: false },
        { id: completedId, name: "Sprint terminé", state: "completed", hasSnapshot: true },
      ],
    });
    expect(mocks.sprintReportProps).toHaveBeenCalledWith(expect.objectContaining({
      backlogKey: "CASS",
      report: expect.objectContaining({
        sprint: expect.objectContaining({
          startedAt: "2026-08-01T09:00:00.000Z",
          plannedStartAt: "2026-08-01T08:00:00.000Z",
        }),
        items: expect.objectContaining({
          rows: [expect.objectContaining({ firstJoinedAt: "2026-08-01T09:00:00.000Z" })],
        }),
        events: expect.objectContaining({
          rows: [expect.objectContaining({
            sequence: "9",
            occurredAt: "2026-08-02T09:00:00.000Z",
          })],
        }),
      }),
    }));
    expect(() => JSON.stringify(mocks.sprintReportProps.mock.calls[0]?.[0])).not.toThrow();
  });

  it("falls back to the newest completed sprint when no sprint is active", async () => {
    mocks.listReportableSprints.mockResolvedValueOnce({
      sprints: [completedSprint],
      plannedCount: 0,
    });
    mocks.getSprintReport.mockResolvedValueOnce({
      kind: "legacy_unavailable",
      statusLabel: "Historique détaillé indisponible",
      sprint: completedSprint,
    });

    render(await ReportsPage({ params: Promise.resolve({ key: "CASS" }) }));

    expect(mocks.getSprintReport).toHaveBeenCalledWith(
      backlog.id,
      completedId,
      { itemPage: 1, eventPage: 1, pageSize: 50 },
    );
  });

  it("renders distinct selector state when only planned sprints exist", async () => {
    mocks.listReportableSprints.mockResolvedValueOnce({ sprints: [], plannedCount: 2 });

    render(await ReportsPage({ params: Promise.resolve({ key: "CASS" }) }));

    expect(mocks.navigationProps).toHaveBeenCalledWith(expect.objectContaining({
      selectedSprintId: null,
      sprints: [],
      plannedCount: 2,
    }));
    expect(mocks.getSprintReport).not.toHaveBeenCalled();
  });

  it("conceals an explicit missing, foreign, or planned sprint after the scoped read", async () => {
    const explicitId = "66666666-6666-4666-8666-666666666666";
    mocks.getSprintReport.mockResolvedValueOnce(null);

    await expect(ReportsPage({
      params: Promise.resolve({ key: "CASS" }),
      searchParams: Promise.resolve({ sprint: explicitId }),
    })).rejects.toThrow("not-found");

    expect(mocks.getSprintReport).toHaveBeenCalledWith(
      backlog.id,
      explicitId,
      { itemPage: 1, eventPage: 1, pageSize: 50 },
    );
  });

  it.each(["7", "12"] as const)("passes velocity limit %s exactly", async (limit) => {
    mocks.getVelocityReport.mockResolvedValueOnce({
      state: "empty",
      label: "Pas encore de vélocité",
      limit: Number(limit),
      bars: [],
      population: 0,
      averageCompletedPoints: null,
    });

    render(await ReportsPage({
      params: Promise.resolve({ key: "CASS" }),
      searchParams: Promise.resolve({ report: "velocity", limit }),
    }));

    expect(mocks.getVelocityReport).toHaveBeenCalledWith(backlog.id, Number(limit));
    expect(mocks.velocityReportProps).toHaveBeenCalledWith(expect.objectContaining({
      backlogKey: "CASS",
      report: expect.objectContaining({ limit: Number(limit) }),
    }));
    expect(mocks.getSprintReport).not.toHaveBeenCalled();
  });

  describe("burndown", () => {
    const browseOnly = {
      createItems: false,
      editItems: false,
      transitionItems: false,
      scheduleItems: false,
      assignItems: false,
      deleteItems: false,
      restoreItems: false,
      addComments: false,
      editOwnComments: false,
      deleteOwnComments: false,
      deleteAllComments: false,
      linkItems: false,
      manageSprints: false,
      manageWorkflow: false,
      manageMembers: false,
      bulkChangeItems: false,
    };

    it("selects the active sprint by default and serializes dates and sequences", async () => {
      render(await ReportsPage({
        params: Promise.resolve({ key: "CASS" }),
        searchParams: Promise.resolve({ report: "burndown", eventPage: "2" }),
      }));

      expect(screen.getByText("Rapport burndown")).toBeVisible();
      expect(mocks.getBurndownReport).toHaveBeenCalledWith(backlog.id, activeId, {
        eventPage: 2,
        pageSize: 50,
      });
      expect(mocks.getSprintReport).not.toHaveBeenCalled();
      expect(mocks.getVelocityReport).not.toHaveBeenCalled();
      expect(mocks.navigationProps).toHaveBeenCalledWith(expect.objectContaining({
        report: "burndown",
        selectedSprintId: activeId,
      }));
      const props = mocks.burndownReportProps.mock.calls[0]?.[0];
      expect(props).toMatchObject({
        backlogKey: "CASS",
        report: {
          kind: "active",
          statusLabel: "Données en cours",
          sprint: {
            startedAt: "2026-08-01T09:00:00.000Z",
            plannedEndAt: "2026-08-15T09:00:00.000Z",
            completedAt: null,
          },
          baseline: { occurredAt: "2026-08-01T09:00:00.000Z", sequence: null },
          observedAt: "2026-08-03T09:00:00.000Z",
          eventPoints: {
            page: 2,
            rows: [{ occurredAt: "2026-08-02T09:00:00.000Z", sequence: "9007199254740993" }],
          },
          events: {
            rows: [{ occurredAt: "2026-08-02T09:00:00.000Z", sequence: "9007199254740993" }],
          },
        },
      });
      expect(JSON.parse(JSON.stringify(props))).toEqual(props);
    });

    it("falls back to the newest completed sprint when no sprint is active", async () => {
      mocks.listReportableSprints.mockResolvedValueOnce({
        sprints: [completedSprint],
        plannedCount: 0,
      });

      render(await ReportsPage({
        params: Promise.resolve({ key: "CASS" }),
        searchParams: Promise.resolve({ report: "burndown" }),
      }));

      expect(mocks.getBurndownReport).toHaveBeenCalledWith(backlog.id, completedId, {
        eventPage: 1,
        pageSize: 50,
      });
      expect(mocks.getSprintReport).not.toHaveBeenCalled();
    });

    it.each([
      ["no sprint", 0],
      ["planned-only sprints", 2],
    ])("renders the selector state without reading a report for %s", async (_label, plannedCount) => {
      mocks.listReportableSprints.mockResolvedValueOnce({ sprints: [], plannedCount });

      render(await ReportsPage({
        params: Promise.resolve({ key: "CASS" }),
        searchParams: Promise.resolve({ report: "burndown" }),
      }));

      expect(mocks.navigationProps).toHaveBeenCalledWith(expect.objectContaining({
        report: "burndown",
        selectedSprintId: null,
        sprints: [],
        plannedCount,
      }));
      expect(mocks.getBurndownReport).not.toHaveBeenCalled();
      expect(mocks.getSprintReport).not.toHaveBeenCalled();
      expect(mocks.burndownReportProps).not.toHaveBeenCalled();
    });

    it("lets a browse_backlog-only caller read the burndown", async () => {
      mocks.getBacklogCapabilities.mockResolvedValueOnce(browseOnly);

      render(await ReportsPage({
        params: Promise.resolve({ key: "CASS" }),
        searchParams: Promise.resolve({ report: "burndown", sprint: completedId }),
      }));

      expect(mocks.getBurndownReport).toHaveBeenCalledWith(backlog.id, completedId, {
        eventPage: 1,
        pageSize: 50,
      });
      expect(screen.getByText("Rapport burndown")).toBeVisible();
    });

    it("conceals a malformed sprint before session and report reads", async () => {
      await expect(ReportsPage({
        params: Promise.resolve({ key: "CASS" }),
        searchParams: Promise.resolve({ report: "burndown", sprint: "not-a-uuid" }),
      })).rejects.toThrow("not-found");

      expect(mocks.requireSession).not.toHaveBeenCalled();
      expect(mocks.getBurndownReport).not.toHaveBeenCalled();
    });

    it.each(["foreign", "planned"])(
      "conceals an explicitly selected %s sprint without falling through to the sprint report",
      async () => {
        const explicitId = "66666666-6666-4666-8666-666666666666";
        mocks.getBurndownReport.mockResolvedValueOnce(null);

        await expect(ReportsPage({
          params: Promise.resolve({ key: "CASS" }),
          searchParams: Promise.resolve({ report: "burndown", sprint: explicitId }),
        })).rejects.toThrow("not-found");

        expect(mocks.getBurndownReport).toHaveBeenCalledWith(backlog.id, explicitId, {
          eventPage: 1,
          pageSize: 50,
        });
        expect(mocks.getSprintReport).not.toHaveBeenCalled();
        expect(mocks.burndownReportProps).not.toHaveBeenCalled();
      },
    );
  });
});
