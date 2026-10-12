"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ViewUrlEntry } from "@/lib/items/view-url-params";

type ParamsMutation = (params: URLSearchParams) => void;
type NavigationOptions = { scroll?: boolean; authoritative?: boolean };

type ViewUrlState = {
  href: (mutate: ParamsMutation) => string;
  push: (mutate: ParamsMutation, options?: NavigationOptions) => void;
  replace: (mutate: ParamsMutation, options?: NavigationOptions) => void;
  getExternalRevision: () => number;
  /** A copy of the current params: latest local writes, else the URL. */
  getParams: () => URLSearchParams;
  revision: number;
};

type AuthorityStore = {
  version: number;
  listeners: Set<() => void>;
};

type NavigationLedger = {
  pathname: string;
  nextGeneration: number;
  origins: Map<string, number>;
};

const ViewUrlStateContext = createContext<ViewUrlState | null>(null);

function paramsKey(params: URLSearchParams): string {
  const normalized = new URLSearchParams(params);
  normalized.sort();
  return normalized.toString();
}

function locationKey(pathname: string, params: URLSearchParams): string {
  return `${pathname}?${paramsKey(params)}`;
}

export function ViewUrlStateProvider({
  initialEntries,
  children,
}: {
  initialEntries: ViewUrlEntry[];
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const serverParams = new URLSearchParams(initialEntries);
  const serverQuery = serverParams.toString();
  const serverLocationKey = locationKey(pathname, serverParams);
  const latestParams = useRef(serverParams);
  const lastServerLocation = useRef(serverLocationKey);
  const navigationLedger = useRef<NavigationLedger>({
    pathname,
    nextGeneration: 0,
    origins: new Map(),
  });
  const externalRevision = useRef(0);
  const authorityStore = useRef<AuthorityStore | null>(null);
  if (authorityStore.current === null) {
    authorityStore.current = { version: 0, listeners: new Set() };
  }

  const subscribe = useCallback((listener: () => void) => {
    const store = authorityStore.current!;
    store.listeners.add(listener);
    return () => store.listeners.delete(listener);
  }, []);
  const getSnapshot = useCallback(() => authorityStore.current!.version, []);
  const getServerSnapshot = useCallback(() => 0, []);
  const authorityVersion = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const publish = useCallback(() => {
    const store = authorityStore.current!;
    store.version += 1;
    for (const listener of [...store.listeners]) listener();
  }, []);

  useLayoutEffect(() => {
    if (navigationLedger.current.pathname !== pathname) {
      navigationLedger.current = {
        pathname,
        nextGeneration: 0,
        origins: new Map(),
      };
      lastServerLocation.current = serverLocationKey;
      latestParams.current = new URLSearchParams(serverQuery);
      externalRevision.current += 1;
      publish();
      return;
    }

    if (serverLocationKey !== lastServerLocation.current) {
      const latestLocationKey = locationKey(pathname, latestParams.current);
      const isInternalOrigin = navigationLedger.current.origins.has(
        serverLocationKey,
      );

      if (isInternalOrigin && serverLocationKey === latestLocationKey) {
        lastServerLocation.current = serverLocationKey;
      } else if (!isInternalOrigin) {
        lastServerLocation.current = serverLocationKey;
        latestParams.current = new URLSearchParams(serverQuery);
        externalRevision.current += 1;
        publish();
      }
    }
  }, [initialEntries, pathname, publish, serverLocationKey, serverQuery]);

  const href = useCallback(
    (mutate: ParamsMutation) => {
      const next = new URLSearchParams(latestParams.current);
      mutate(next);
      const query = next.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [pathname],
  );

  useEffect(() => {
    function syncFromHistory() {
      const params = new URLSearchParams(window.location.search);
      const historyPathname = window.location.pathname;
      if (navigationLedger.current.pathname !== historyPathname) {
        navigationLedger.current = {
          pathname: historyPathname,
          nextGeneration: 0,
          origins: new Map(),
        };
      }
      latestParams.current = params;
      lastServerLocation.current = locationKey(historyPathname, params);
      externalRevision.current += 1;
      publish();
    }

    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, [publish]);

  const navigate = useCallback(
    (method: "push" | "replace", mutate: ParamsMutation, options?: NavigationOptions) => {
      const currentQuery = latestParams.current.toString();
      const next = new URLSearchParams(latestParams.current);
      mutate(next);
      latestParams.current = next;
      const query = next.toString();
      if (query !== currentQuery) {
        const ledger = navigationLedger.current;
        ledger.nextGeneration += 1;
        ledger.origins.set(
          locationKey(pathname, next),
          ledger.nextGeneration,
        );
      }
      if (options?.authoritative) externalRevision.current += 1;
      if (query !== currentQuery) {
        publish();
      }
      const href = query ? `${pathname}?${query}` : pathname;
      const routerOptions =
        options?.scroll === undefined ? undefined : { scroll: options.scroll };
      startTransition(() => {
        if (method === "push") {
          if (routerOptions) router.push(href, routerOptions);
          else router.push(href);
        } else if (routerOptions) {
          router.replace(href, routerOptions);
        } else {
          router.replace(href);
        }
      });
    },
    [pathname, publish, router],
  );

  const push = useCallback(
    (mutate: ParamsMutation, options?: NavigationOptions) => {
      navigate("push", mutate, options);
    },
    [navigate],
  );

  const replace = useCallback(
    (mutate: ParamsMutation, options?: NavigationOptions) => {
      navigate("replace", mutate, options);
    },
    [navigate],
  );

  const getExternalRevision = useCallback(() => externalRevision.current, []);
  const getParams = useCallback(() => new URLSearchParams(latestParams.current), []);

  const value = useMemo(
    () => ({ href, push, replace, getExternalRevision, getParams, revision: authorityVersion }),
    [authorityVersion, getExternalRevision, getParams, href, push, replace],
  );

  return (
    <ViewUrlStateContext.Provider value={value}>
      {children}
    </ViewUrlStateContext.Provider>
  );
}

export function RouteViewUrlStateProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const initialEntries = useMemo(
    () => Array.from(new URLSearchParams(query).entries()),
    [query],
  );

  return (
    <ViewUrlStateProvider initialEntries={initialEntries}>
      {children}
    </ViewUrlStateProvider>
  );
}

/** The view URL state when rendered inside a backlog view, else null. */
export function useOptionalViewUrlState(): ViewUrlState | null {
  return useContext(ViewUrlStateContext);
}

export function useViewUrlState(): ViewUrlState {
  const state = useContext(ViewUrlStateContext);
  if (!state) {
    throw new Error("useViewUrlState must be used within ViewUrlStateProvider");
  }
  return state;
}

/** The item the drawer should show: `?item=` of the latest requested URL. */
export function useRequestedItemKey(): string | null {
  return useViewUrlState().getParams().get("item");
}
