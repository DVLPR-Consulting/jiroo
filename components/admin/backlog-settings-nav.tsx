import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Tabs between a backlog's settings pages, like Jira's project settings:
 * « Accès », « Développement » and « Modèles ». Only backlog administrators
 * see these tabs.
 */
export function BacklogSettingsNav({
  backlogKey,
  current,
  canAdministerBacklog,
}: {
  backlogKey: string;
  current: "access" | "development" | "templates";
  canAdministerBacklog: boolean;
}) {
  if (!canAdministerBacklog) return null;
  const tabs = [
    { id: "access", label: "Accès", href: `/b/${backlogKey}/settings/access` },
    { id: "development", label: "Développement", href: `/b/${backlogKey}/settings/development` },
    { id: "templates", label: "Modèles", href: `/b/${backlogKey}/settings/templates` },
  ] as const;
  return (
    <nav aria-label="Réglages du backlog" className="flex gap-1 border-b border-border">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === current ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm",
            tab.id === current
              ? "border-[var(--primary)] font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
