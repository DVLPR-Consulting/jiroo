import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

type RequestCache = Map<string, Promise<unknown>>;

const storage = new AsyncLocalStorage<RequestCache>();

/**
 * Runs `work` with one cache for the authorization reads it makes (JIR-119):
 * the actor, a backlog's scheme, the administrator status and a grant
 * question asked twice during one action are read once. The cache lives for
 * that call only: nothing is shared between requests or users, and a read
 * outside any scope is never cached.
 */
export function withRequestCache<T>(work: () => Promise<T>): Promise<T> {
  return storage.run(new Map(), work);
}

/** Reads through the current request's cache, or directly outside a scope. */
export function cachedRead<T>(key: string, read: () => Promise<T>): Promise<T> {
  const cache = storage.getStore();
  if (!cache) return read();
  const hit = cache.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const pending = read().catch((error: unknown) => {
    // A failed read is not an answer: the next caller reads again.
    cache.delete(key);
    throw error;
  });
  cache.set(key, pending);
  return pending;
}
