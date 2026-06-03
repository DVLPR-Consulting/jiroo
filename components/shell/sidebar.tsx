import Link from "next/link";
import { Layers, Settings, Trash2, User } from "lucide-react";
import { UserCard } from "@/components/shell/user-card";

type Backlog = { id: string; key: string; name: string; color: string };

export function Sidebar({
  backlogs,
  user,
}: {
  backlogs: Backlog[];
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
      <nav className="flex flex-col gap-0.5">
        {backlogs.map((b) => (
          <Link
            key={b.id}
            href={`/b/${b.key}`}
            className="flex items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-sm hover:bg-[var(--muted)]"
          >
            <span
              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
              style={{ background: b.color }}
            >
              {b.key}
            </span>
            <span className="truncate">{b.name}</span>
          </Link>
        ))}
      </nav>

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
        <span
          className="flex cursor-default items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-sm text-muted-foreground"
          title="bientôt"
        >
          <User className="size-4" />
          Mes items
        </span>
      </div>

      {/* Views (placeholder — later lot) */}
      <div className="t-meta px-2 pt-3 pb-1 text-muted-foreground">Vues perso</div>
      <div className="px-2 py-1 text-sm text-muted-foreground">Aucune vue</div>
      <div className="t-meta px-2 pt-3 pb-1 text-muted-foreground">Vues partagées</div>
      <div className="px-2 py-1 text-sm text-muted-foreground">Aucune vue</div>

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
