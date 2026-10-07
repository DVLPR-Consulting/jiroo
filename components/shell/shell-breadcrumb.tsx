"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { deriveShellContext } from "@/lib/items/shell";
import { cn } from "@/lib/utils";

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

  // Below the shell's mobile breakpoint (the sidebar becomes a drawer), the
  // parent segment yields so the current page stays readable (JIR-63). The
  // full trail remains in the accessible text and the hover title.
  return (
    <nav aria-label="Fil d’Ariane" className="min-w-0" data-slot="shell-breadcrumb">
      <span className="sr-only">{accessibleText}</span>
      <span
        aria-hidden="true"
        className="flex min-w-0 items-center gap-2 text-sm"
        title={accessibleText}
      >
        <span
          className={cn("truncate font-medium", detail && "hidden md:inline")}
          data-slot="shell-breadcrumb-parent"
        >
          {primary}
        </span>
        {detail && (
          <>
            <span className="hidden text-muted-foreground md:inline">/</span>
            <span
              className="truncate font-medium text-foreground md:font-normal md:text-muted-foreground"
              data-slot="shell-breadcrumb-current"
            >
              {detail}
            </span>
          </>
        )}
      </span>
    </nav>
  );
}
