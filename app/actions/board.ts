"use server";

import { getSession } from "@/lib/auth/session";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import { loadBoardSummary, type BoardSummary } from "@/lib/services/board-summary";

export type BoardSummaryResult =
  | { ok: true; summary: BoardSummary }
  | { ok: false; error: string };

/**
 * The Board's sprint figures, read apart from the page (JIR-119): after an
 * action the Board applies the item it got back and refreshes these figures
 * alone, instead of rendering the whole page again. Read-only, for a backlog
 * the user may browse (unknown, archived or forbidden backlogs answer alike).
 */
export async function boardSummaryAction(backlogKey: string): Promise<BoardSummaryResult> {
  const session = await getSession();
  if (!session) throw new Error("Forbidden");
  if (typeof backlogKey !== "string" || backlogKey.trim() === "" || backlogKey.length > 20) {
    return { ok: false, error: "Lecture impossible." };
  }
  try {
    const backlog = await getBacklogByKeyForUser(backlogKey, session.user.id);
    if (!backlog || backlog.archivedAt) return { ok: false, error: "Lecture impossible." };
    return { ok: true, summary: await loadBoardSummary(backlog.id) };
  } catch {
    return { ok: false, error: "Lecture impossible." };
  }
}
