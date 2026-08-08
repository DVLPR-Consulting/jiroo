export type ReportUrlState = {
  report: "sprint" | "velocity";
  sprintId: string | null;
  limit: 7 | 12;
  itemPage: number;
  eventPage: number;
};

type Query = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

function positiveInteger(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export function parseReportUrlState(query: Query): ReportUrlState {
  const report = first(query.report) === "velocity" ? "velocity" : "sprint";
  const rawLimit = first(query.limit);
  return {
    report,
    sprintId: first(query.sprint) ?? null,
    limit: rawLimit === "12" ? 12 : 7,
    itemPage: positiveInteger(first(query.itemPage)),
    eventPage: positiveInteger(first(query.eventPage)),
  };
}
