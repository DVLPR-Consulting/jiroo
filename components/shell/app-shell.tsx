"use client";

import {
  SidebarStateProvider,
  useSidebarState,
} from "@/components/shell/sidebar-state";
import { TopbarCreateProvider } from "@/components/shell/topbar-create";
import { RouteViewUrlStateProvider } from "@/components/shell/view-url-state";
import { GlobalShortcuts } from "@/components/shortcuts/global-shortcuts";
import { KeyboardShortcutsProvider } from "@/components/shortcuts/keyboard-shortcuts-provider";
import { Toaster } from "@/components/ui/toaster";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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

  // The columns and the inline sidebar follow the CSS breakpoint, not the media
  // query hook: its server snapshot says "desktop", so the first render on a
  // phone would otherwise lay out the 248 px column and overflow until
  // hydration (JIR-127).
  // Both the frame and <main> are positioned: a visually hidden label (absolute)
  // inside a row would otherwise take the page as containing block and lengthen
  // the document, which then scrolls the whole shell (JIR-162).
  return (
    <div
      className={cn(
        "relative grid h-screen grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-clip transition-[grid-template-columns] duration-150",
        collapsed ? "md:grid-cols-[64px_minmax(0,1fr)]" : "md:grid-cols-[248px_minmax(0,1fr)]",
      )}
    >
      {!mobile && <div className="hidden md:contents">{sidebar}</div>}
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
        <main className="relative min-h-0 flex-1 overflow-auto bg-background">{children}</main>
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
        <KeyboardShortcutsProvider>
          <GlobalShortcuts />
          <TopbarCreateProvider>
            <AppShellFrame {...props} />
          </TopbarCreateProvider>
        </KeyboardShortcutsProvider>
      </RouteViewUrlStateProvider>
    </SidebarStateProvider>
  );
}
