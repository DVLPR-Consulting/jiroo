"use client";

import { createContext, useContext, useLayoutEffect, useState } from "react";

type SidebarState = { collapsed: boolean; toggle: () => void };

const SidebarStateContext = createContext<SidebarState | null>(null);

export function SidebarStateProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useLayoutEffect(() => {
    const initial = document.documentElement.dataset.sidebar === "collapsed";
    // Synchronize once with the attribute already applied by NoFlashScript.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(initial);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.dataset.sidebar = next ? "collapsed" : "open";
    try {
      localStorage.setItem("jiroo-sidebar-collapsed", String(next));
    } catch {}
  }

  return (
    <SidebarStateContext.Provider value={{ collapsed, toggle }}>
      {children}
    </SidebarStateContext.Provider>
  );
}

export function useSidebarState(): SidebarState {
  const context = useContext(SidebarStateContext);
  if (!context) throw new Error("useSidebarState must be used within SidebarStateProvider");
  return context;
}
