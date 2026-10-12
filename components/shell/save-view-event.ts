/**
 * The sidebar's « + Enregistrer une vue » line asks the mounted view actions
 * (item views only) to open their « Enregistrer sous… » dialog.
 */
export const OPEN_SAVE_VIEW_EVENT = "jiroo:open-save-view";

/** A request made while the page was still loading waits this long. */
const PENDING_TTL_MS = 10_000;
let pendingAt: number | null = null;

export function requestSaveView(): void {
  pendingAt = Date.now();
  window.dispatchEvent(new Event(OPEN_SAVE_VIEW_EVENT));
}

/** Clears the pending request once a listener has handled it. */
export function acknowledgeSaveView(): void {
  pendingAt = null;
}

/**
 * For view actions mounting after the click (the page was still streaming):
 * whether a recent request is waiting, consuming it.
 */
export function takePendingSaveView(): boolean {
  const pending = pendingAt !== null && Date.now() - pendingAt < PENDING_TTL_MS;
  pendingAt = null;
  return pending;
}
