/** Dependency-free toast store. Framework-agnostic; no React import. */

export type ToastAction = {
  label: string;
  run: () => void | Promise<void>;
};

export type Toast = {
  id: number;
  variant: "success" | "error";
  message: string;
  action?: ToastAction;
  /** A second, non-destructive action shown before `action` (e.g. « Ouvrir »). */
  secondaryAction?: ToastAction;
};

type ToastOptions = { action?: ToastAction; secondaryAction?: ToastAction };

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** Module-level id counter — deterministic, never Math.random / Date.now. */
let nextId = 1;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

// ---------------------------------------------------------------------------
// External store API (compatible with useSyncExternalStore)
// ---------------------------------------------------------------------------

/** Subscribe to store changes. Returns an unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Returns the current snapshot.
 * A new array reference is created only on push/dismiss, so
 * useSyncExternalStore won't loop on unrelated renders.
 */
export function getSnapshot(): Toast[] {
  return toasts;
}

/** Append a new toast, notify listeners, return the new id. */
export function push(
  variant: Toast["variant"],
  message: string,
  options?: ToastOptions,
): number {
  const id = nextId++;
  const nextToast: Toast = { id, variant, message };
  if (options?.action) nextToast.action = options.action;
  if (options?.secondaryAction) nextToast.secondaryAction = options.secondaryAction;
  toasts = [...toasts, nextToast];
  notify();
  return id;
}

/** Remove a toast by id and notify listeners. No-op for unknown ids. */
export function dismiss(id: number): void {
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

// ---------------------------------------------------------------------------
// Public toast API
// ---------------------------------------------------------------------------

export const toast = {
  success(message: string, options?: ToastOptions): number {
    return push("success", message, options);
  },
  error(message: string, options?: ToastOptions): number {
    return push("error", message, options);
  },
};

// ---------------------------------------------------------------------------
// Test helpers (only for use in *.test.ts files)
// ---------------------------------------------------------------------------

/** Reset store state and id counter to initial values. Call in beforeEach. */
export function __resetToastsForTest(): void {
  nextId = 1;
  toasts = [];
  listeners.clear();
}
