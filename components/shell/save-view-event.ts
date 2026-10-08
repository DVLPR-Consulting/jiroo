/**
 * The sidebar's « + Enregistrer une vue » line asks the mounted view actions
 * (item views only) to open their « Enregistrer sous… » dialog.
 */
export const OPEN_SAVE_VIEW_EVENT = "jiroo:open-save-view";

export function requestSaveView(): void {
  window.dispatchEvent(new Event(OPEN_SAVE_VIEW_EVENT));
}
