import Link from "next/link";
import { Layers, Settings, Trash2, User } from "lucide-react";
import { BacklogSelector } from "@/components/shell/backlog-selector";
import { NavLink } from "@/components/shell/nav-link";
import { SidebarViews } from "@/components/shell/sidebar-views";
import { UserCard } from "@/components/shell/user-card";
import type { SidebarViewRow } from "@/components/shell/sidebar-views";

type Backlog = { id: string; key: string; name: string; color: string };

export function Sidebar({
  backlogs,
  views,
  userId,
  user,
}: {
  backlogs: Backlog[];
  views: SidebarViewRow[];
  userId: string;
  user: { name: string; email: string; role: string };
}) {
  return (
    <div className="flex h-full flex-col gap-1 border-r border-border bg-[var(--surface-2)] p-3">
      {/* Logo */}
      <div className="t-h2 px-2 py-1 font-semibold">
        Jir<span className="text-[var(--primary)]">oo</span>
      </div>

      {/* Backlogs */}
      <div className="t-meta px-2 pt-2 pb-1 text-muted-foreground">Backlogs</div>
      <BacklogSelector backlogs={backlogs} />

      {/* Nav (placeholder — later lot) */}
      <div className="t-meta px-2 pt-3 pb-1 text-muted-foreground">Navigation</div>
      <div className="flex flex-col gap-0.5">
        <span
          className="flex cursor-default items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-sm text-muted-foreground"
          title="bientôt"
        >
          <Layers className="size-4" />
          Tous les items
        </span>
        <NavLink href="/mine">
          <User className="size-4" />
          Mes items
        </NavLink>
      </div>

      {/* Saved views — personal & shared */}
      <SidebarViews views={views} userId={userId} backlogs={backlogs} />

      {/* Bottom */}
      <div className="mt-auto flex flex-col gap-1">
        <Link
          href="/trash"
          className="flex items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-sm hover:bg-[var(--muted)]"
        >
          <Trash2 className="size-4" />
          Corbeille
        </Link>
        {user.role === "admin" && (
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-sm hover:bg-[var(--muted)]"
          >
            <Settings className="size-4" />
            Administration
          </Link>
        )}
        <UserCard user={user} />
      </div>
    </div>
  );
}
