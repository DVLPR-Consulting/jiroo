"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type CreateSlot = {
  node: HTMLElement | null;
  setNode: (node: HTMLElement | null) => void;
};

const CreateSlotContext = createContext<CreateSlot | null>(null);

/**
 * The top bar's « + Créer » button (JIR-74) belongs to the page that knows
 * the project, its items and the user's rights: the page renders it through
 * `TopbarCreate`, and the top bar only provides the place it lands in.
 */
export function TopbarCreateProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  return (
    <CreateSlotContext.Provider value={{ node, setNode }}>
      {children}
    </CreateSlotContext.Provider>
  );
}

/** Where the page's create action appears in the top bar. */
export function TopbarCreateSlot() {
  const slot = useContext(CreateSlotContext);
  return (
    <div
      ref={slot?.setNode}
      data-slot="topbar-create"
      className="flex shrink-0 items-center empty:hidden"
    />
  );
}

/** Renders `children` in the top bar's create slot (nothing outside the shell). */
export function TopbarCreate({ children }: { children: ReactNode }) {
  const slot = useContext(CreateSlotContext);
  if (!slot?.node) return null;
  return createPortal(children, slot.node);
}
