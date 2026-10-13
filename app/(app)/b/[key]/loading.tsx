"use client";

import { useSearchParams } from "next/navigation";
import { BacklogViewSkeleton } from "@/components/items/view-skeletons";
import { itemViewFromParam } from "@/lib/items/shell";

/**
 * `loading.tsx` receives no props: a client component reads `?view=` so the
 * placeholder takes the requested view's shape (JIR-84).
 */
export default function BacklogLoading() {
  const view = itemViewFromParam(useSearchParams().get("view"));
  return <BacklogViewSkeleton view={view} />;
}
