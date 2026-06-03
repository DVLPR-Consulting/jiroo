import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function Topbar() {
  return (
    <div className="flex h-[52px] items-center gap-3 border-b border-border bg-[var(--surface)] px-4">
      <span className="t-h3">Jiroo</span>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" disabled title="Recherche — bientôt">
          <Search className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" disabled title="Notifications — bientôt">
          <Bell className="size-4" />
        </Button>
        <ThemeToggle />
      </div>
    </div>
  );
}
