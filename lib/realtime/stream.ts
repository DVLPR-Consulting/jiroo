import "server-only";

import type { BusListener, BusMessage } from "@/lib/realtime/bus";
import { toWireEvent, type RealtimeSubscription, type WireEvent } from "@/lib/realtime/events";

/** Keeps proxies and load balancers from closing an idle stream. */
const HEARTBEAT_MS = 25_000;
/**
 * The browser reconnects on its own when the stream ends, and the route checks
 * access again then: a revoked access never stays open for long. Also stays
 * under the 300 s function limit on Vercel.
 */
const LIFETIME_MS = 4 * 60_000;
/** How long EventSource waits before reconnecting. */
const RETRY_MS = 3_000;

export type ChangeStreamOptions = {
  subscribe: (subscription: RealtimeSubscription, listener: BusListener) => () => void;
  subscription: RealtimeSubscription;
  signal: AbortSignal;
  heartbeatMs?: number;
  lifetimeMs?: number;
};

function toWire(message: BusMessage, viewerId: string): WireEvent {
  return message.kind === "resync"
    ? { kind: "resync", self: false }
    : toWireEvent(message, viewerId);
}

/** A Server-Sent Events stream of the changes one viewer may see. */
export function createChangeStream({
  subscribe,
  subscription,
  signal,
  heartbeatMs = HEARTBEAT_MS,
  lifetimeMs = LIFETIME_MS,
}: ChangeStreamOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal.aborted) {
        controller.close();
        return;
      }

      let closed = false;
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      send(`retry: ${RETRY_MS}\n\n`);

      const unsubscribe = subscribe(subscription, (message) =>
        send(`data: ${JSON.stringify(toWire(message, subscription.userId))}\n\n`),
      );
      const heartbeat = setInterval(() => send(": ping\n\n"), heartbeatMs);
      const lifetime = setTimeout(() => close(), lifetimeMs);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        signal.removeEventListener("abort", close);
        unsubscribe();
      };
      function close() {
        if (closed) return;
        cleanup();
        controller.close();
      }
      signal.addEventListener("abort", close);
    },
    cancel() {
      cleanup();
    },
  });
}
