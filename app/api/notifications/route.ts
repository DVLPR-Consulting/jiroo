import { getSession } from "@/lib/auth/session";
import { stringifyDatedJson } from "@/lib/serialization/dated-json";
import { listRecentNotifications, unreadCount } from "@/lib/services/notifications";

// Per-user data: never stored by the browser or any shared cache.
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * The notification bell's data, refetched by the bell when the realtime stream
 * says it changed: the same queries as the server render of the app layout.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401, headers: NO_STORE });

  const [count, notifications] = await Promise.all([
    unreadCount(session.user.id),
    listRecentNotifications(session.user.id),
  ]);
  return new Response(stringifyDatedJson({ unreadCount: count, notifications }), {
    status: 200,
    headers: { ...NO_STORE, "Content-Type": "application/json; charset=utf-8" },
  });
}
