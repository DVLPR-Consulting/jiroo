import type { Metadata } from "next";
import { LePointView } from "@/components/le-point/le-point-view";
import { requireAppPageSession } from "@/lib/auth/session";
import { LE_POINT_DEMO } from "@/lib/le-point/fixtures";

export const metadata: Metadata = { title: "Le point (démonstration) — Jiroo" };

/**
 * « Le point » prototype (JIR-107): reachable by its address only, on
 * fictional data. It reads and writes nothing; the current views are kept.
 */
export default async function LePointPage() {
  await requireAppPageSession();
  return <LePointView data={LE_POINT_DEMO} />;
}
