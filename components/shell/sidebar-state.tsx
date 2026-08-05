"use client";

import { createContext, useContext, useLayoutEffect, useState } from "react";
import { useMediaQuery } from "@/components/shell/use-media-query";

type SidebarState = {
  collapsed: boolean;
  mobile: boolean;
  mobileOpen: boolean;
  toggle: () => void;
  closeMobile: () => void;
};

const SidebarStateContext = createContext<SidebarState | null>(null);

export function SidebarStateProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobile = useMediaQuery("(max-width: 767px)");

  useLayoutEffect(() => {
    const initial = document.documentElement.dataset.sidebar === "collapsed";
    // Synchronize once with the attribute already applied by NoFlashScript.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(initial);
  }, []);

  function toggle() {
    if (mobile) {
      setMobileOpen((current) => !current);
      return;
    }
    setCollapsed((current) => {
      const next = !current;
      document.documentElement.dataset.sidebar = next ? "collapsed" : "open";
      try {
        localStorage.setItem("jiroo-sidebar-collapsed", String(next));
      } catch {}
      return next;
    });
  }

  function closeMobile() {
    setMobileOpen(false);
  }

  return (
    <SidebarStateContext.Provider
      value={{ collapsed, mobile, mobileOpen, toggle, closeMobile }}
    >
      {children}
    </SidebarStateContext.Provider>
  );
}

export function useSidebarState(): SidebarState {
  const context = useContext(SidebarStateContext);
  if (!context) throw new Error("useSidebarState must be used within SidebarStateProvider");
  return context;
}
