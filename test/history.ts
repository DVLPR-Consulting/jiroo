/**
 * The URL after a History API update: opening, switching or closing the item
 * drawer changes `?item=` through `window.history` rather than the router
 * (ViewUrlStateProvider), so tests read it from the location.
 */
export function currentHref(): string {
  return `${window.location.pathname}${window.location.search}`;
}
