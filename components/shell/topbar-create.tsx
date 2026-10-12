"use client";

import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * Where the slot element lives. A stable store rather than context state:
 * setting the slot during hydration must not push a context update into the
 * page's still-streaming Suspense boundary (React would then client-render
 * it next to the streamed copy).
 */
type CreateSlotStore = {
  get: () => HTMLElement | null;
  set: (node: HTMLElement | null) => void;
  subscribe: (listener: () => void) => () => void;
};

function createSlotStore(): CreateSlotStore {
  let node: HTMLElement | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => node,
    set: (next) => {
      if (next === node) return;
      node = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const CreateSlotContext = createContext<CreateSlotStore | null>(null);

/**
 * The top bar's « + Créer » button (JIR-74) belongs to the page that knows
 * the project, its items and the user's rights: the page renders it through
 * `TopbarCreate`, and the top bar only provides the place it lands in.
 */
export function TopbarCreateProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createSlotStore);
  return <CreateSlotContext.Provider value={store}>{children}</CreateSlotContext.Provider>;
}

/** Where the page's create action appears in the top bar. */
export function TopbarCreateSlot() {
  const store = useContext(CreateSlotContext);
  return (
    <div
      ref={store?.set}
      data-slot="topbar-create"
      className="flex shrink-0 items-center empty:hidden"
    />
  );
}

const noSlot = () => null;
const noSubscribe = () => () => {};

/** Renders `children` in the top bar's create slot (nothing outside the shell). */
export function TopbarCreate({ children }: { children: ReactNode }) {
  const store = useContext(CreateSlotContext);
  const node = useSyncExternalStore(
    store?.subscribe ?? noSubscribe,
    store?.get ?? noSlot,
    noSlot,
  );
  if (!node) return null;
  return createPortal(children, node);
}
