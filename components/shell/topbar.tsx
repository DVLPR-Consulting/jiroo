import { ThemeToggle } from "@/components/theme/theme-toggle";
import { HelpLink } from "@/components/shell/help-link";
import { NotificationBell } from "@/components/shell/notification-bell";
import { SearchModal } from "@/components/shell/search-modal";
import { ShellBreadcrumb } from "@/components/shell/shell-breadcrumb";
import { SidebarTrigger } from "@/components/shell/sidebar-trigger";
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
      className="flex h-[52px] items-center gap-3 border-b border-border bg-[var(--surface)] px-4"
      data-slot="shell-topbar"
    >
      <SidebarTrigger />
      <div
        aria-hidden="true"
        className="h-4 w-px shrink-0 bg-border"
        data-slot="sidebar-trigger-separator"
      />
      <ShellBreadcrumb backlogs={backlogs} views={views} />
      <div className="ml-auto flex items-center gap-1">
        <SearchModal />
        <NotificationBell notifications={notifications} unreadCount={unreadCount} />
        <HelpLink />
        <ThemeToggle />
      </div>
    </div>
  );
}
