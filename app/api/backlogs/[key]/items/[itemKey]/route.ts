import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { BACKLOG_KEY_RE } from "@/lib/validation/backlog";
import { stringifyDatedJson } from "@/lib/serialization/dated-json";
import { loadItemDetailData } from "@/lib/services/item-detail";

// Per-user data: never stored by the browser or any shared cache.
const NO_STORE = { "Cache-Control": "private, no-store" };

const paramsSchema = z.object({
  key: z.string().regex(BACKLOG_KEY_RE),
  itemKey: z.string().regex(/^[A-Za-z]{2,6}-\d{1,9}$/),
});

/**
 * The item drawer's detail, fetched by the drawer when an item is opened from
 * a backlog view: the URL changes without re-rendering the whole view on the
 * server (see ItemDetailDrawer). Same data and checks as the server render of
 * a `?item=` deep link (lib/services/item-detail).
 *
 * 404 covers an unknown, archived or non-browsable backlog and an unknown
 * item alike, so the answer never reveals that a backlog exists.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string; itemKey: string }> },
) {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401, headers: NO_STORE });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return new Response(null, { status: 404, headers: NO_STORE });

  const data = await loadItemDetailData({
    userId: session.user.id,
    backlogKey: parsed.data.key,
    itemKey: parsed.data.itemKey,
  });
  if (!data || data.kind === "not-found") {
    return new Response(null, { status: 404, headers: NO_STORE });
  }
  return new Response(stringifyDatedJson(data), {
    status: 200,
    headers: { ...NO_STORE, "Content-Type": "application/json; charset=utf-8" },
  });
}
