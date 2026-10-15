"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reactionFor, type WireEvent } from "@/lib/realtime/events";

/** Events arriving this close together reach the listeners as one batch. */
const BATCH_MS = 300;
/** A tab hidden longer than this drops its stream and catches up on return. */
const HIDDEN_GRACE_MS = 60_000;

const WIRE_KINDS = new Set<WireEvent["kind"]>([
  "item",
  "sprint",
  "release",
  "backlog",
  "notification",
  "resync",
]);

export type RealtimeListener = (events: readonly WireEvent[]) => void;

const RealtimeContext = createContext<{
  subscribe: (listener: RealtimeListener) => () => void;
} | null>(null);

/** Calls `handler` with each batch of changes; a no-op outside the provider. */
export function useRealtime(handler: RealtimeListener): void {
  const context = useContext(RealtimeContext);
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => context?.subscribe((events) => latest.current(events)), [context]);
}

export function backlogKeyFromPath(pathname: string | null): string | null {
  return pathname?.match(/^\/b\/([^/]+)/)?.[1] ?? null;
}

function parseWireEvent(data: unknown): WireEvent | null {
  if (typeof data !== "string") return null;
  try {
    const event = JSON.parse(data) as Partial<WireEvent> | null;
    if (!event || !event.kind || !WIRE_KINDS.has(event.kind) || typeof event.self !== "boolean") {
      return null;
    }
    return event as WireEvent;
  } catch {
    return null;
  }
}

/**
 * One change stream per tab: the backlog shown in the URL, if any, and the
 * viewer's notifications. Listeners refresh what they own (the bell, the open
 * item); lists never reorder under the user's eyes, a banner offers a refresh
 * instead, as Jira's « This board has been updated ».
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const backlogKey = backlogKeyFromPath(usePathname());
  const listeners = useRef(new Set<RealtimeListener>());
  const [context] = useState(() => ({
    subscribe(listener: RealtimeListener) {
      listeners.current.add(listener);
      return () => {
        listeners.current.delete(listener);
      };
    },
  }));

  const [banner, setBanner] = useState<{ backlogKey: string | null; visible: boolean }>({
    backlogKey,
    visible: false,
  });
  // A banner belongs to the backlog it was raised for.
  if (banner.backlogKey !== backlogKey) setBanner({ backlogKey, visible: false });

  useEffect(() => {
    let source: EventSource | null = null;
    let opened = false;
    let queue: WireEvent[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;

    function deliver(events: readonly WireEvent[], raiseBanner: boolean) {
      for (const listener of listeners.current) listener(events);
      if (
        raiseBanner
        && backlogKey !== null
        && events.some((event) => reactionFor(event, { openItemId: null }).showBanner)
      ) {
        setBanner({ backlogKey, visible: true });
      }
    }

    function flush() {
      flushTimer = null;
      const events = queue;
      queue = [];
      if (events.length > 0) deliver(events, true);
    }

    /** After a gap (hidden tab, reconnect): refresh quietly, no banner. */
    function catchUp() {
      deliver([{ kind: "resync", self: false }], false);
    }

    function connect() {
      const url = backlogKey
        ? `/api/realtime?backlog=${encodeURIComponent(backlogKey)}`
        : "/api/realtime";
      source = new EventSource(url);
      source.onopen = () => {
        if (opened) catchUp();
        opened = true;
      };
      source.onmessage = (message) => {
        const event = parseWireEvent(message.data);
        if (!event) return;
        queue.push(event);
        flushTimer ??= setTimeout(flush, BATCH_MS);
      };
    }

    function disconnect() {
      source?.close();
      source = null;
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenTimer ??= setTimeout(() => {
          hiddenTimer = null;
          disconnect();
        }, HIDDEN_GRACE_MS);
        return;
      }
      if (hiddenTimer) clearTimeout(hiddenTimer);
      hiddenTimer = null;
      if (!source) connect();
    }

    connect();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (flushTimer) clearTimeout(flushTimer);
      if (hiddenTimer) clearTimeout(hiddenTimer);
      disconnect();
    };
  }, [backlogKey]);

  return (
    <RealtimeContext.Provider value={context}>
      {children}
      {banner.visible ? (
        <div
          role="status"
          className="fixed left-1/2 top-16 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-[var(--radius-md)] border border-border bg-card py-1.5 pl-3.5 pr-1.5 text-[13px] shadow-[var(--shadow-md)]"
        >
          <span>Ce backlog a été modifié par quelqu&apos;un d&apos;autre.</span>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setBanner({ backlogKey, visible: false });
              router.refresh();
            }}
          >
            Actualiser
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Masquer"
            onClick={() => setBanner({ backlogKey, visible: false })}
          >
            <X />
          </Button>
        </div>
      ) : null}
    </RealtimeContext.Provider>
  );
}
