"use client";

import { SidebarStateProvider } from "@/components/shell/sidebar-state";
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
  return (
    <div
      className="grid h-screen overflow-hidden transition-[grid-template-columns] duration-150"
      style={{
        gridTemplateColumns: "var(--sidebar-width, 248px) minmax(0,1fr)",
      }}
    >
      {sidebar}
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
