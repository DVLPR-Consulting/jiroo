import { ThemeToggle } from "@/components/theme/theme-toggle";
import { HelpLink } from "@/components/shell/help-link";
import { NotificationBell } from "@/components/shell/notification-bell";
import { SearchModal } from "@/components/shell/search-modal";
import { ShellBreadcrumb } from "@/components/shell/shell-breadcrumb";
import { SidebarTrigger } from "@/components/shell/sidebar-trigger";
import { TopbarCreateSlot } from "@/components/shell/topbar-create";
import type { NotificationRow } from "@/lib/services/notifications";

export function Topbar({
  notifications,
  unreadCount,
  backlogs,
  views,
}: {
  notifications: NotificationRow[];
  unreadCount: number;
  backlogs: Array<{ id: string; key: string; name: string }>;
  views: Array<{ id: string; name: string; backlogId: string | null }>;
}) {
  return (
    <div
      className="flex h-[52px] items-center gap-2 border-b border-border bg-[var(--surface)] px-2 sm:gap-3 sm:px-4"
      data-slot="shell-topbar"
    >
      <SidebarTrigger />
      <div
        aria-hidden="true"
        className="h-4 w-px shrink-0 bg-border"
        data-slot="sidebar-trigger-separator"
      />
      <ShellBreadcrumb backlogs={backlogs} views={views} />
      {/* Centre: the search field and the page's « + Créer » (JIR-74). */}
      <div
        className="flex min-w-0 flex-1 items-center justify-center gap-2"
        data-slot="topbar-center"
      >
        <div className="flex min-w-0 max-w-[520px] flex-1 items-center gap-2">
          <SearchModal />
          <TopbarCreateSlot />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5" data-slot="topbar-actions">
        <NotificationBell notifications={notifications} unreadCount={unreadCount} />
        <HelpLink />
        <ThemeToggle />
      </div>
    </div>
  );
}
