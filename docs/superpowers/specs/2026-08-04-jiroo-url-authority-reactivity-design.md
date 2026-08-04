# Jiroo URL Authority Reactivity Design

## Goal

Make every active-backlog D4 anchor and mutation, including persistent shell/sidebar links, consume one reactive URL authority across optimistic writes, server reconciliation, browser history, repeated unrelated query parameters, and delayed navigation echoes.

## AppShell-scoped authority

`ViewUrlStateProvider` remains the only same-page URL writer. The production provider is lifted into `AppShell`, where it wraps the sidebar, topbar, and route children without any module singleton. A route adapter reads the installed Next.js `usePathname` and `useSearchParams` APIs and passes ordered repeated tuples into the ref-owned provider. Focused tests may continue to inject a serializable tuple array:

```ts
type ViewUrlEntry = [string, string];

type ViewUrlStateProviderProps = {
  initialEntries: ViewUrlEntry[];
  children: ReactNode;
};
```

The provider owns an AppShell-local store created once in a ref. The store contains a monotonically increasing version and a subscriber set. `useSyncExternalStore` subscribes the provider to that version; `getServerSnapshot` always returns the stable initial version `0`, matching the initial server and hydration render. The client snapshot also starts at `0`.

Every authority mutation follows the same order:

1. mutate `latestParams.current`;
2. record internal origin or advance the external revision for an authoritative saved-view/history write;
3. synchronously publish a new store version;
4. invoke the router for internal push/replace writes.

Optimistic push/replace publishes before router navigation. Genuine external server params reconcile and publish inside `useLayoutEffect`, so href consumers rerender before paint. `popstate` updates the authority and publishes synchronously from its event handler.

The context value is rebuilt when the store version changes. `href(mutate)` always clones `latestParams.current`, so every anchor receives an updated native target on every optimistic, external, or history authority advance.

## Exact navigation generations and tombstones

Every internal navigation records an exact location identity containing the pathname plus normalized repeated query tuples and a monotonically increasing navigation generation. The identity-to-generation map is a tombstone ledger: settling an internal response does not delete its identity, and popstate or external reconciliation does not clear it. A settled `A`, settled `B`, or pending `B` therefore remains recognizable through repeated delayed server renders after authority has advanced.

Current and stale internal server echoes never replace latest params, increment external revision, or publish. Unknown external params can reconcile in the layout effect. Browser `popstate` is directly authoritative even when its destination has an internal tombstone: it updates latest params, advances external revision, and publishes before any server echo.

The ledger's bound is its lifecycle, not a probabilistic or arbitrary entry cap. It exists only for the current pathname within one mounted AppShell provider, resets synchronously on a pathname boundary, and disappears on unmount. Old-page responses cannot reconcile into the provider after that boundary. Within a same-path session, correctness requires retaining every exact internal identity because any one may still echo.

## Page search-parameter normalization

The Next page prop uses the documented type:

```ts
Record<string, string | string[] | undefined>
```

`firstSearchParam` returns a scalar unchanged, the first array value, or `undefined`. The page applies this rule explicitly to `item`, `view`, and `v`. It also builds the `parseViewState` input by selecting the first value for each known view-state key: `q`, `type`, `status`, `prio`, `assignee`, `label`, `kind`, `under`, `group`, and `sort`.

The AppShell route adapter copies `useSearchParams` through `URLSearchParams.toString()`, preserving every repeated value. Unrelated values such as `tag=a&tag=b` survive q, grouping, sorting, item, saved-view, and tab mutations.

## Persistent sidebar and saved-view selection

The AppShell provider makes the persistent sidebar a context descendant rather than a sibling of the backlog-page authority. No global store, server singleton, or cross-request state is introduced.

Applying a sidebar saved view clones the latest authority, deletes every known view-state key (`q`, `type`, `status`, `prio`, `assignee`, `label`, `kind`, `under`, `group`, `sort`) plus `view`, `v`, and `item`, then writes the saved filters/group/sort, display mode, and saved-view id. This explicitly closes the detail item while preserving every unrelated parameter and repeated value in its existing order.

The sidebar derives the saved-view native href with `viewUrl.href`. Ordinary `onNavigate` uses an authoritative provider push; modified/new-tab navigation retains the complete native href and does not invoke the provider. Authoritative pushes synchronously advance the external revision, so an armed query debounce cannot dirty or overwrite the selected saved view.

The active-backlog “Tous les items” link and selecting the already-active backlog use the same authoritative path and clear known view/item state. Different-backlog and global links remain direct cross-page navigation.

## Other same-page anchors and obsolete props

ViewBar and related-item links build hrefs with `viewUrl.href`, then use `onNavigate` for ordinary client navigation. Because Next does not call `onNavigate` for Cmd/Ctrl-click, downloads, or external navigation, modified clicks retain the current complete native target.

Obsolete scalar URL props remain absent from `ViewBar`, `FilterBar`, `GroupControl`, `ViewActions`, `ItemList`, `ItemBoard`, and `ItemTree`. Business-state props such as parsed `state`, `currentSort`, and selected item remain unchanged.

## Topbar item navigation

Search-result selection and notification selection share one item-navigation-only hook. The hook derives the active backlog from both the actual pathname shape and the installed route parameter: the pathname must be exactly `/b/[key]`, its decoded segment must equal `useParams().key`, and backlog-key comparisons are case-insensitive. A stale route param, a nested or non-backlog pathname, and an override-like value therefore cannot opt a caller into same-page navigation.

When the target backlog equals that verified active backlog, the hook calls `viewUrl.push(params => params.set("item", itemKey))`. This preserves the authority's current `view`, `v`, grouping, filters, unrelated repeated tuples, and any optimistic writes that have not reached the server yet. It also records the selected item in the exact same-path navigation ledger, so selecting a previously tombstoned item creates a new navigation generation rather than bypassing authority.

When the target is another backlog, or the current pathname is not exactly a backlog route such as `/mine`, the hook retains a direct router push to `/b/${backlogKey}?item=${itemKey}`. Search still closes and clears after selection. Notifications still mark the selected row read before navigating, and refresh-only notifications remain unchanged.

The returned item-navigation callback is stable, but it does not capture route evidence from the render that created an async caller. The hook owns a ref containing the latest committed pathname, scalar route parameter, router, and URL authority. A layout effect replaces that snapshot after every relevant commit. At invocation, including after NotificationBell awaits `markReadAction`, the stable callback evaluates the unchanged exact-route predicate against that committed snapshot and uses its provider or router. If the shell moved from `/b/DEMO` to `/mine` or `/b/OTHER` while mark-read was pending, the eventual DEMO item selection is direct and cannot mutate or preserve the obsolete DEMO authority. If the committed route remains `/b/DEMO`, provider composition remains unchanged. Search selection is synchronous and uses the same latest committed callback.

## Verification design

Focused regressions must fail against the current implementation and pass after the fix:

- settled internal `A`, settled internal `B`, then two delayed `A` renders retain `B`;
- pending internal `B`, then popstate/external `C`, then two delayed `B` renders retain `C`;
- a real later popstate visit to a tombstoned key is accepted directly;
- exact tombstones survive settlement and external/history advances for the full same-path lifecycle, then reset at a pathname boundary;
- q followed by a sidebar saved view cancels q, removes `item`, replaces all known saved-view state, and preserves `tag=a&tag=b`;
- the sidebar saved-view modified-click href is complete and does not perform provider navigation;
- active-backlog “Tous les items” and active backlog selection cannot be overwritten by an armed q;
- each Topbar entry point preserves view state and repeated unrelated tuples for a verified same-backlog selection, composes with an armed q debounce, and reopens a previously tombstoned item through the provider;
- each Topbar entry point keeps direct navigation for another backlog and for `/mine`, while retaining search-close and notification mark-read behavior;
- a pending notification selection that commits `/mine` or another backlog before mark-read resolves uses the new route evidence and performs direct minimal navigation;
- a pending notification selection that rerenders on the same active backlog still uses provider navigation and preserves current authority state;
- existing optimistic href, repeated-param, Back/popstate, pending echo, push/replace/scroll, and refresh-only tests remain green.

## Scope

No DnD, filter matching semantics, saved-view schema, server action, database query, breadcrumb derivation, or different-backlog/global navigation changes are included.
