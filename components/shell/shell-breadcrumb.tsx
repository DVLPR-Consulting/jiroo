"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { deriveShellContext } from "@/lib/items/shell";

type BreadcrumbBacklog = { id: string; key: string; name: string };
type BreadcrumbView = { id: string; name: string; backlogId: string | null };

export function ShellBreadcrumb({
  backlogs,
  views,
}: {
  backlogs: BreadcrumbBacklog[];
  views: BreadcrumbView[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const backlogKeys = new Map(backlogs.map((backlog) => [backlog.id, backlog.key]));
  const context = deriveShellContext({
    pathname,
    search: new URLSearchParams(searchParams.toString()),
    backlogs,
    views: views.flatMap((view) => {
      const backlogKey = view.backlogId ? backlogKeys.get(view.backlogId) : undefined;
      return backlogKey ? [{ id: view.id, name: view.name, backlogKey }] : [];
    }),
  });

  const contextBacklog = context.activeBacklogKey
    ? backlogs.find(
        (backlog) => backlog.key.toUpperCase() === context.activeBacklogKey?.toUpperCase(),
      )
    : undefined;
  const primary = context.mode
    ? `${context.section} · ${context.mode}`
    : contextBacklog?.name ?? context.section;
  const detail = context.mode
    ? context.viewTitle
    : contextBacklog && context.section !== contextBacklog.name
      ? context.section
      : undefined;
  const accessibleText = detail ? `${primary} / ${detail}` : primary;

  return (
    <nav aria-label="Fil d’Ariane" className="min-w-0" data-slot="shell-breadcrumb">
      <span className="sr-only">{accessibleText}</span>
      <span aria-hidden="true" className="flex min-w-0 items-center gap-2 text-sm">
        <span className="truncate font-medium">{primary}</span>
        {detail && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="truncate text-muted-foreground">{detail}</span>
          </>
        )}
      </span>
    </nav>
  );
}
