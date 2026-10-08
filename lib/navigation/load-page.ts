/**
 * Navigates with a full page load. Used after signing in or out so that no
 * in-memory client state (e.g. kept description drafts, router cache)
 * survives a change of identity.
 */
export function loadPage(url: string) {
  window.location.assign(url);
}
