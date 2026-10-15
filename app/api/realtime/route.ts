import { getSession } from "@/lib/auth/session";
import { getRealtimeBus } from "@/lib/realtime/bus";
import { createChangeStream } from "@/lib/realtime/stream";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import { BACKLOG_KEY_RE } from "@/lib/validation/backlog";

// Node runtime: the bus holds a pg LISTEN connection.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * The change stream of one tab (Server-Sent Events): the changes of the backlog
 * it shows, if any, and the viewer's own notifications. Events carry ids only;
 * the tab reloads through the usual permission-checked paths.
 *
 * An unknown backlog and one the viewer may not browse get the same answer,
 * only the viewer's notifications, so it never reveals that a backlog exists
 * and a refused page keeps its bell (no failed request in the console).
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401, headers: NO_STORE });
  const userId = session.user.id;

  let backlogId: string | null = null;
  const backlogKey = new URL(request.url).searchParams.get("backlog");
  if (backlogKey !== null) {
    const backlog = BACKLOG_KEY_RE.test(backlogKey)
      ? await getBacklogByKeyForUser(backlogKey, userId)
      : null;
    backlogId = backlog?.id ?? null;
  }

  const bus = getRealtimeBus();
  const stream = createChangeStream({
    subscribe: (subscription, listener) => bus.subscribe(subscription, listener),
    subscription: { backlogId, userId },
    signal: request.signal,
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform: no proxy compression, which would buffer the events.
      "Cache-Control": "private, no-cache, no-transform",
      // Nginx buffers proxied responses unless told otherwise.
      "X-Accel-Buffering": "no",
    },
  });
}
