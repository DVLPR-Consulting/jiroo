"use client";

import {
  Suspense,
  use,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { ItemKey } from "@/components/jiroo/item-key";
import {
  useRequestedItemKey,
  useViewUrlState,
} from "@/components/shell/view-url-state";
import { ItemDetailPanel } from "@/components/items/item-detail-panel";
import { RecentItemTracker } from "@/components/items/recent-item-tracker";
import { DetailPanelSkeleton } from "@/components/items/view-skeletons";
import { useRealtime } from "@/components/realtime/realtime-provider";
import type { Filters } from "@/lib/items/filter";
import type { ItemDetailData } from "@/lib/items/item-detail-data";
import { reactionFor } from "@/lib/realtime/events";
import { parseDatedJson } from "@/lib/serialization/dated-json";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

/** Matches the sheet-right exit animation (handoff: translateX 220ms). */
export const ITEM_DETAIL_SHEET_EXIT_MS = 220;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The item detail drawer frame. It mounts as soon as `?item=` is in the URL and
 * stays mounted while the detail streams in (its Suspense boundary lives inside
 * `children`), so the panel slides in once instead of a loading overlay being
 * swapped for the real dialog. Closing lets the exit slide finish before the
 * URL drops `item`, because that navigation unmounts the drawer.
 */
export function ItemDetailSheet({
  itemKey,
  children,
}: {
  itemKey: string;
  children: ReactNode;
}) {
  const viewUrl = useViewUrlState();
  const [open, setOpen] = useState(true);
  const [openedKey, setOpenedKey] = useState(itemKey);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
      ? document.activeElement
      : null,
  );

  // Another item was opened while this one was closing: show it again.
  if (openedKey !== itemKey) {
    setOpenedKey(itemKey);
    setOpen(true);
  }
  useEffect(() => {
    if (open && closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const navigateAway = () => {
    closeTimer.current = null;
    const dropItem = (params: URLSearchParams) => {
      if (params.get("item") === itemKey) params.delete("item");
    };
    // Skip when another item replaced this one during the exit animation.
    if (viewUrl.href(dropItem) === viewUrl.href(() => {})) return;
    viewUrl.push(dropItem);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (prefersReducedMotion()) {
      navigateAway();
      return;
    }
    closeTimer.current = setTimeout(navigateAway, ITEM_DETAIL_SHEET_EXIT_MS);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        variant="sheet-right"
        data-shortcut-scope="item"
        showCloseButton={false}
        aria-describedby={undefined}
        className="bg-[var(--surface)] shadow-lg"
        onCloseAutoFocus={(event) => {
          const returnTarget = returnFocusRef.current;
          if (returnTarget?.isConnected) {
            event.preventDefault();
            returnTarget.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          const target = event.target;
          // Escape belongs to the title editor and to widgets that close
          // themselves on it (the Markdown editor's link form).
          if (
            target instanceof Element &&
            (target.matches('[aria-label="Titre de l’item"]') ||
              target.closest("[data-local-escape]"))
          ) {
            event.preventDefault();
          }
        }}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** The drawer's detail, plus a failed client fetch. */
export type DrawerDetail = ItemDetailData | { kind: "error"; itemKey: string };

/** Fetches the drawer's detail from its Route Handler; never rejects. */
export async function fetchItemDetail(
  backlogKey: string,
  itemKey: string,
): Promise<DrawerDetail> {
  try {
    const response = await fetch(
      `/api/backlogs/${encodeURIComponent(backlogKey)}/items/${encodeURIComponent(itemKey)}`,
      { cache: "no-store", headers: { Accept: "application/json" } },
    );
    if (response.status === 404) return { kind: "not-found", itemKey };
    if (!response.ok) return { kind: "error", itemKey };
    return parseDatedJson<ItemDetailData>(await response.text());
  } catch {
    return { kind: "error", itemKey };
  }
}

type ClientRequest = { backlogKey: string; itemKey: string; promise: Promise<DrawerDetail> };

/**
 * One fetch per opening of `itemKey` (null: nothing to fetch). The request
 * lives in state so a re-render reuses its promise; clearing it on close or
 * when the server provides the detail makes the next opening fetch afresh.
 * `refetch` starts a new request from an event handler: a suspended
 * transition render is discarded, so it cannot start one itself.
 */
function useClientItemDetail(
  backlogKey: string,
  itemKey: string | null,
): { promise: Promise<DrawerDetail> | null; refetch: (itemKey: string) => void } {
  const [request, setRequest] = useState<ClientRequest | null>(null);
  const refetch = (key: string) =>
    setRequest({ backlogKey, itemKey: key, promise: fetchItemDetail(backlogKey, key) });
  if (itemKey === null) {
    if (request !== null) setRequest(null);
    return { promise: null, refetch };
  }
  if (request?.itemKey === itemKey && request.backlogKey === backlogKey) {
    return { promise: request.promise, refetch };
  }
  const next = { backlogKey, itemKey, promise: fetchItemDetail(backlogKey, itemKey) };
  setRequest(next);
  return { promise: next.promise, refetch };
}

/**
 * The server's detail while it is current: from the server render until the
 * user leaves that item (close or switch, which renders nothing on the
 * server). Reopening it then fetches afresh rather than showing data as old
 * as the last server render; the next server render brings a new promise.
 */
function useCurrentServerDetail(
  requestedKey: string | null,
  itemKey: string | null,
  detail: Promise<ItemDetailData | null> | null | undefined,
  version: number,
): Promise<ItemDetailData | null> | null {
  const [seen, setSeen] = useState<{
    requestedKey: string | null;
    detail: typeof detail;
    stale: typeof detail;
    version: number;
  }>({ requestedKey, detail, stale: null, version });
  let stale = seen.stale;
  if (seen.requestedKey !== requestedKey || seen.detail !== detail || seen.version !== version) {
    const leftServerItem =
      detail != null
      && seen.detail === detail
      && seen.requestedKey === itemKey
      && requestedKey !== itemKey;
    // Someone else changed the item since the server rendered it.
    const outdated = detail != null && seen.detail === detail && seen.version !== version;
    if (leftServerItem || outdated) stale = detail;
    setSeen({ requestedKey, detail, stale, version });
  }
  return requestedKey !== null && requestedKey === itemKey && detail && detail !== stale
    ? detail
    : null;
}

/**
 * Mounts the item drawer as soon as `?item=` is requested, not when the detail
 * arrives: the frame and a skeleton slide in on click, and the detail replaces
 * the skeleton inside the same dialog once its promise resolves.
 *
 * Opening an item from a view only changes the URL through the History API
 * (ViewUrlStateProvider), so the server does not re-render the view: the
 * drawer fetches the detail itself. When the server did render the requested
 * item — a deep link, or a refresh after a mutation — its detail is used
 * instead, in the same position of the tree, so an edit refreshes the open
 * panel in place.
 */
export function ItemDetailDrawer({
  backlogKey,
  itemKey,
  detail,
  viewFilters,
}: {
  backlogKey: string;
  /** The effective filters of the view behind the drawer (JIR-92). */
  viewFilters?: Filters;
  /** The item the server loaded `detail` for, or null when none. */
  itemKey: string | null;
  /** The server's detail for `itemKey` (null: inaccessible backlog). */
  detail?: Promise<ItemDetailData | null> | null;
}) {
  const requestedKey = useRequestedItemKey();
  // Bumped when the item changed elsewhere: the server's detail is then outdated.
  const [version, setVersion] = useState(0);
  const [, startTransition] = useTransition();
  const serverDetail = useCurrentServerDetail(requestedKey, itemKey, detail, version);
  const { promise: clientDetail, refetch } = useClientItemDetail(
    backlogKey,
    serverDetail ? null : requestedKey,
  );
  if (!requestedKey) return null;
  const source = serverDetail ?? clientDetail;
  return (
    <ItemDetailSheet itemKey={requestedKey}>
      {source ? (
        <Suspense key={requestedKey} fallback={<DetailPanelSkeleton />}>
          <ItemDetailBody
            itemKey={requestedKey}
            detail={source}
            viewFilters={viewFilters}
            onChangedElsewhere={() =>
              // A transition keeps the open panel on screen while it refetches.
              startTransition(() => {
                setVersion((current) => current + 1);
                refetch(requestedKey);
              })
            }
          />
        </Suspense>
      ) : (
        <DetailPanelSkeleton />
      )}
    </ItemDetailSheet>
  );
}

/** The drawer content once its detail promise resolves. */
function ItemDetailBody({
  itemKey,
  detail,
  viewFilters,
  onChangedElsewhere,
}: {
  itemKey: string;
  detail: Promise<DrawerDetail | null>;
  viewFilters?: Filters;
  onChangedElsewhere: () => void;
}) {
  const data = use(detail);
  if (data?.kind === "error") return <ItemDetailLoadError itemKey={itemKey} />;
  if (data?.kind !== "item") return <ItemDetailNotFound itemKey={itemKey} />;
  return (
    <>
      <RefreshOnChange itemId={data.panel.detail.id} onChange={onChangedElsewhere} />
      <RecentItemTracker itemKey={data.panel.detail.key} />
      <ItemDetailPanel key={data.panel.detail.id} {...data.panel} viewFilters={viewFilters} />
    </>
  );
}

/** Refetches the open item when a realtime change may have touched it. */
function RefreshOnChange({ itemId, onChange }: { itemId: string; onChange: () => void }) {
  useRealtime((events) => {
    if (events.some((event) => reactionFor(event, { openItemId: itemId }).refreshOpenItem)) {
      onChange();
    }
  });
  return null;
}

function ItemDetailMessage({
  itemKey,
  title,
  children,
}: {
  itemKey: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <DialogTitle className="sr-only">{title}</DialogTitle>
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <ItemKey value={itemKey} />
        <DialogClose asChild>
          <button
            type="button"
            aria-label="Fermer"
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-[var(--muted)]"
          >
            <X className="size-4" />
          </button>
        </DialogClose>
      </header>
      <p className="p-5 text-sm text-muted-foreground">{children}</p>
    </>
  );
}

/** Drawer body for a key that no longer resolves (deleted or mistyped link). */
export function ItemDetailNotFound({ itemKey }: { itemKey: string }) {
  return (
    <ItemDetailMessage itemKey={itemKey} title={`Item ${itemKey} introuvable`}>
      Cet item est introuvable ou a été supprimé.
    </ItemDetailMessage>
  );
}

/** Drawer body when the detail could not be fetched (network or server error). */
export function ItemDetailLoadError({ itemKey }: { itemKey: string }) {
  return (
    <ItemDetailMessage itemKey={itemKey} title={`Item ${itemKey} indisponible`}>
      Impossible de charger cet item. Vérifiez la connexion puis rouvrez-le.
    </ItemDetailMessage>
  );
}
