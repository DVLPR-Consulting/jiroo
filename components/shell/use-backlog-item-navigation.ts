"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useViewUrlState } from "@/components/shell/view-url-state";

function normalizeBacklogKey(key: string): string {
  return key.toUpperCase();
}

function activeBacklogKey(
  pathname: string,
  routeParam: string | string[] | undefined,
): string | undefined {
  if (typeof routeParam !== "string") return undefined;

  const pathnameMatch = /^\/b\/([^/]+)$/.exec(pathname);
  const pathnameSegment = pathnameMatch?.[1];
  if (!pathnameSegment) return undefined;

  let pathnameKey: string;
  try {
    pathnameKey = decodeURIComponent(pathnameSegment);
  } catch {
    return undefined;
  }

  return normalizeBacklogKey(pathnameKey) === normalizeBacklogKey(routeParam)
    ? normalizeBacklogKey(routeParam)
    : undefined;
}

export function useBacklogItemNavigation(): (
  backlogKey: string,
  itemKey: string,
) => void {
  const pathname = usePathname();
  const params = useParams<{ key?: string | string[] }>();
  const router = useRouter();
  const viewUrl = useViewUrlState();
  const latestCommitted = useRef({
    pathname,
    routeParam: params.key,
    router,
    viewUrl,
  });

  useLayoutEffect(() => {
    latestCommitted.current = {
      pathname,
      routeParam: params.key,
      router,
      viewUrl,
    };
  }, [params.key, pathname, router, viewUrl]);

  return useCallback(
    (backlogKey: string, itemKey: string) => {
      const current = latestCommitted.current;
      const currentBacklogKey = activeBacklogKey(
        current.pathname,
        current.routeParam,
      );
      if (
        currentBacklogKey &&
        normalizeBacklogKey(backlogKey) === currentBacklogKey
      ) {
        current.viewUrl.push((urlParams) => urlParams.set("item", itemKey));
        return;
      }

      current.router.push(`/b/${backlogKey}?item=${itemKey}`);
    },
    [],
  );
}
