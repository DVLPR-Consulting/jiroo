import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NotificationBell } from "@/components/shell/notification-bell";
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
        <Button variant="ghost" size="icon" disabled title="Recherche — bientôt">
          <Search className="size-4" />
        </Button>
        <NotificationBell notifications={notifications} unreadCount={unreadCount} />
        <ThemeToggle />
      </div>
    </div>
  );
}
