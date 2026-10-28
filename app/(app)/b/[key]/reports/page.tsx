import { Suspense } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BurndownReportView } from "@/components/reports/burndown-report";
import { SprintsReviewView } from "@/components/reports/sprints-review";
import { ReportNavigation } from "@/components/reports/report-navigation";
import {
  SprintReportView,
  type SerializableSprintReport,
} from "@/components/reports/sprint-report";
import { VelocityReportView } from "@/components/reports/velocity-report";
import { BacklogTopbarCreate } from "@/components/shell/backlog-topbar-create";
import { PageHeader } from "@/components/shell/page-header";
import { getBacklogCapabilities } from "@/lib/auth/accessible-backlogs";
import { requireAppPageSession } from "@/lib/auth/session";
import { serializeBurndownReport } from "@/lib/reports/burndown-serialization";
import { parseReportUrlState } from "@/lib/reports/report-url";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import { getBurndownReport } from "@/lib/services/sprint-burndown";
import {
  getSprintsReview,
  getSprintReport,
  getVelocityReport,
  listReportableSprints,
  type SprintReport,
  type VelocityReport,
} from "@/lib/services/sprint-reports";

type Query = Record<string, string | string[] | undefined>;

function serializeSprintReport(report: SprintReport): SerializableSprintReport {
  if (report.kind === "legacy_unavailable") {
    return {
      kind: report.kind,
      statusLabel: report.statusLabel,
      sprint: {
        ...report.sprint,
        startedAt: report.sprint.startedAt.toISOString(),
        completedAt: report.sprint.completedAt?.toISOString() ?? null,
      },
    };
  }

  const detailed = {
    kind: report.kind,
    statusLabel: report.statusLabel,
    sprint: {
      ...report.sprint,
      plannedStartAt: report.sprint.plannedStartAt?.toISOString() ?? null,
      plannedEndAt: report.sprint.plannedEndAt?.toISOString() ?? null,
      startedAt: report.sprint.startedAt.toISOString(),
      completedAt: report.sprint.completedAt?.toISOString() ?? null,
    },
    metrics: report.metrics,
    sections: report.sections,
    items: {
      ...report.items,
      rows: report.items.rows.map((item) => ({
        ...item,
        firstJoinedAt: item.firstJoinedAt.toISOString(),
        finalLeftAt: item.finalLeftAt?.toISOString() ?? null,
      })),
    },
    events: {
      ...report.events,
      rows: report.events.rows.map((event) => ({
        ...event,
        sequence: event.sequence.toString(),
        occurredAt: event.occurredAt.toISOString(),
      })),
    },
  };

  return report.kind === "completed"
    ? {
        ...detailed,
        kind: "completed",
        statusLabel: "Historique figé",
        snapshotAt: report.snapshotAt.toISOString(),
        finalDestinationSummary: report.finalDestinationSummary,
      }
    : { ...detailed, kind: "active", statusLabel: "Données en cours" };
}

function serializeVelocityReport(report: VelocityReport) {
  return {
    ...report,
    bars: report.bars.map((bar) => ({
      ...bar,
      completedAt: bar.completedAt.toISOString(),
    })),
  };
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams?: Promise<Query>;
}) {
  const [{ key }, query = {}] = await Promise.all([params, searchParams]);
  const state = parseReportUrlState(query);
  if (state.sprintId !== null && !z.uuid().safeParse(state.sprintId).success) notFound();

  const session = await requireAppPageSession();
  const backlog = await getBacklogByKeyForUser(key, session.user.id);
  if (!backlog || backlog.archivedAt) notFound();

  const capabilities = await getBacklogCapabilities(session.user.id, backlog.id);
  if (!capabilities) notFound();

  const selector = state.report === "bilan" ? { sprints: [], plannedCount: 0 } : await listReportableSprints(backlog.id);
  const selectedSprintId = state.sprintId ??
    selector.sprints.find((sprint) => sprint.state === "active")?.id ??
    selector.sprints.find((sprint) => sprint.state === "completed")?.id ??
    null;
  const navigation = (
    <ReportNavigation
      backlogKey={backlog.key}
      report={state.report}
      selectedSprintId={selectedSprintId}
      plannedCount={selector.plannedCount}
      sprints={selector.sprints.map(({ id, name, state: sprintState, hasSnapshot }) => ({
        id,
        name,
        state: sprintState,
        hasSnapshot,
      }))}
    />
  );

  let content = null;
  if (state.report === "bilan") {
    const review = await getSprintsReview(backlog.id, session.user.id);
    if (!review) notFound();
    content = <SprintsReviewView backlogKey={backlog.key} report={review} />;
  } else if (state.report === "velocity") {
    const velocity = await getVelocityReport(backlog.id, state.limit);
    content = (
      <VelocityReportView
        backlogKey={backlog.key}
        report={serializeVelocityReport(velocity)}
      />
    );
  } else if (state.report === "burndown") {
    if (selectedSprintId) {
      const burndown = await getBurndownReport(backlog.id, selectedSprintId, {
        eventPage: state.eventPage,
        pageSize: 50,
      });
      if (!burndown) notFound();
      content = (
        <BurndownReportView
          backlogKey={backlog.key}
          report={serializeBurndownReport(burndown)}
        />
      );
    }
  } else if (selectedSprintId) {
    const sprintReport = await getSprintReport(backlog.id, selectedSprintId, {
      itemPage: state.itemPage,
      eventPage: state.eventPage,
      pageSize: 50,
    });
    if (!sprintReport) notFound();
    content = (
      <SprintReportView
        backlogKey={backlog.key}
        report={serializeSprintReport(sprintReport)}
      />
    );
  }

  return (
    <>
      <Suspense fallback={null}><BacklogTopbarCreate userId={session.user.id} backlogKey={backlog.key} /></Suspense>
      <PageHeader />
      {navigation}
      <div className="space-y-6 px-4 pt-4 pb-6 sm:px-6 lg:pb-8">
        {content}
      </div>
    </>
  );
}
