"use client";

import { createContext, useContext, type ReactNode } from "react";

export type ShellBacklogRef = { id: string; key: string; name: string };
export type ShellViewRef = { id: string; name: string; backlogId: string | null };

type ShellData = { backlogs: ShellBacklogRef[]; views: ShellViewRef[] };

const ShellDataContext = createContext<ShellData>({ backlogs: [], views: [] });

/** The accessible backlogs and saved views, for page headers (JIR-74). */
export function ShellDataProvider({
  backlogs,
  views,
  children,
}: ShellData & { children: ReactNode }) {
  return (
    <ShellDataContext.Provider value={{ backlogs, views }}>
      {children}
    </ShellDataContext.Provider>
  );
}

export function useShellData(): ShellData {
  return useContext(ShellDataContext);
}
