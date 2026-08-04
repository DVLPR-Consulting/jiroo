"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

type ParamsMutation = (params: URLSearchParams) => void;
type NavigationOptions = { scroll?: boolean };

type ViewUrlState = {
  replace: (mutate: ParamsMutation, options?: NavigationOptions) => void;
};

const ViewUrlStateContext = createContext<ViewUrlState | null>(null);

function paramsKey(params: URLSearchParams): string {
  const normalized = new URLSearchParams(params);
  normalized.sort();
  return normalized.toString();
}

export function ViewUrlStateProvider({
  currentParams,
  children,
}: {
  currentParams: Record<string, string>;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const serverParams = new URLSearchParams(currentParams);
  const serverQuery = serverParams.toString();
  const serverKey = paramsKey(serverParams);
  const latestParams = useRef(serverParams);
  const lastServerKey = useRef(serverKey);
  const pendingKeys = useRef(new Set<string>());

  useEffect(() => {
    if (serverKey !== lastServerKey.current) {
      lastServerKey.current = serverKey;
      if (!pendingKeys.current.delete(serverKey)) {
        latestParams.current = new URLSearchParams(serverQuery);
        pendingKeys.current.clear();
      }
    }
  }, [serverKey, serverQuery]);

  useEffect(() => {
    function syncFromHistory() {
      const params = new URLSearchParams(window.location.search);
      latestParams.current = params;
      lastServerKey.current = paramsKey(params);
      pendingKeys.current.clear();
    }

    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  const replace = useCallback(
    (mutate: ParamsMutation, options?: NavigationOptions) => {
      const next = new URLSearchParams(latestParams.current);
      mutate(next);
      latestParams.current = next;
      pendingKeys.current.add(paramsKey(next));
      const query = next.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      startTransition(() => router.replace(href, options));
    },
    [pathname, router],
  );

  const value = useMemo(() => ({ replace }), [replace]);

  return (
    <ViewUrlStateContext.Provider value={value}>
      {children}
    </ViewUrlStateContext.Provider>
  );
}

export function useViewUrlState(): ViewUrlState {
  const state = useContext(ViewUrlStateContext);
  if (!state) {
    throw new Error("useViewUrlState must be used within ViewUrlStateProvider");
  }
  return state;
}
