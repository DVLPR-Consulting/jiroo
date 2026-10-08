"use client";

import {
  SidebarStateProvider,
  useSidebarState,
} from "@/components/shell/sidebar-state";
import { RouteViewUrlStateProvider } from "@/components/shell/view-url-state";
import { GlobalShortcuts } from "@/components/shortcuts/global-shortcuts";
import { KeyboardShortcutsProvider } from "@/components/shortcuts/keyboard-shortcuts-provider";
import { Toaster } from "@/components/ui/toaster";
import { UnsavedDraftsGuard } from "@/components/shell/unsaved-drafts-guard";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

function AppShellFrame({
  sidebar,
  topbar,
  children,
}: {
  sidebar: React.ReactNode;
  topbar: React.ReactNode;
  children: React.ReactNode;
}) {
  const { collapsed, mobile, mobileOpen, closeMobile } = useSidebarState();

  function handleDrawerClick(event: React.MouseEvent<HTMLDivElement>) {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    ) {
      return;
    }
    const target = event.target;
    if (target instanceof Element && target.closest("a[href]")) closeMobile();
  }

  return (
    <div
      className="grid h-screen grid-rows-[minmax(0,1fr)] overflow-hidden transition-[grid-template-columns] duration-150"
      style={{
        gridTemplateColumns: mobile
          ? "minmax(0,1fr)"
          : `${collapsed ? "64px" : "248px"} minmax(0,1fr)`,
      }}
    >
      {!mobile && sidebar}
      {mobile && (
        <Dialog
          open={mobileOpen}
          onOpenChange={(open) => {
            if (!open) closeMobile();
          }}
        >
          <DialogContent
            variant="sheet-left"
            showCloseButton={false}
            aria-describedby={undefined}
            onClickCapture={handleDrawerClick}
          >
            <DialogTitle className="sr-only">Navigation principale</DialogTitle>
            {sidebar}
          </DialogContent>
        </Dialog>
      )}
      <div className="flex min-h-0 min-w-0 flex-col">
        {topbar}
        <main className="min-h-0 flex-1 overflow-auto bg-background">{children}</main>
      </div>
      <Toaster />
      <UnsavedDraftsGuard />
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
        <KeyboardShortcutsProvider>
          <GlobalShortcuts />
          <AppShellFrame {...props} />
        </KeyboardShortcutsProvider>
      </RouteViewUrlStateProvider>
    </SidebarStateProvider>
  );
}
