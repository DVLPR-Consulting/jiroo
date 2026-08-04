"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  SidebarStateProvider,
  useSidebarState,
} from "@/components/shell/sidebar-state";
import { RouteViewUrlStateProvider } from "@/components/shell/view-url-state";
import { Toaster } from "@/components/ui/toaster";

function AppShellFrame({
  sidebar,
  topbar,
  children,
}: {
  sidebar: React.ReactNode;
  topbar: React.ReactNode;
  children: React.ReactNode;
}) {
  const { collapsed, toggle } = useSidebarState();

  return (
    <div
      className="grid h-screen overflow-hidden transition-[grid-template-columns] duration-150"
      style={{
        gridTemplateColumns: `${collapsed ? "64px" : "248px"} minmax(0,1fr)`,
      }}
    >
      <div className="relative min-w-0 overflow-visible">
        {sidebar}
        <button
          type="button"
          onClick={toggle}
          aria-label={
            collapsed
              ? "Déplier la barre latérale"
              : "Replier la barre latérale"
          }
          title={
            collapsed
              ? "Déplier la barre latérale"
              : "Replier la barre latérale"
          }
          className="absolute right-0 top-4 z-20 inline-flex size-8 translate-x-1/2 items-center justify-center rounded-[8px] border border-border bg-[var(--surface-2)] text-muted-foreground shadow-sm transition-colors hover:bg-[var(--muted)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2"
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronLeft className="size-4" />
          )}
        </button>
      </div>
      <div className="flex min-w-0 flex-col">
        {topbar}
        <main className="min-h-0 flex-1 overflow-auto bg-background">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}

export function AppShell(props: {
  sidebar: React.ReactNode;
  topbar: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <SidebarStateProvider>
      <RouteViewUrlStateProvider>
        <AppShellFrame {...props} />
      </RouteViewUrlStateProvider>
    </SidebarStateProvider>
  );
}
