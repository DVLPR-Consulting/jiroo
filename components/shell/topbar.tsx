import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NotificationBell } from "@/components/shell/notification-bell";
import { SearchModal } from "@/components/shell/search-modal";
import type { NotificationRow } from "@/lib/services/notifications";

export function Topbar({
  notifications,
  unreadCount,
}: {
  notifications: NotificationRow[];
  unreadCount: number;
}) {
  return (
    <div className="flex h-[52px] items-center gap-3 border-b border-border bg-[var(--surface)] px-4">
      <span className="t-h3">Jiroo</span>
      <div className="ml-auto flex items-center gap-1">
        <SearchModal />
        <NotificationBell notifications={notifications} unreadCount={unreadCount} />
        <ThemeToggle />
      </div>
    </div>
  );
}
