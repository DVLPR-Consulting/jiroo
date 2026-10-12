"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  useShellData,
  type ShellBacklogRef,
  type ShellViewRef,
} from "@/components/shell/shell-data";
import { deriveBreadcrumb } from "@/lib/items/shell";

/**
 * The page header's trail (JIR-74): `Projet / Vue`, then the active saved
 * view. The project leads back to the backlog home, as Jira's breadcrumb leads
 * back to the project (JIR-72). Segments wrap rather than truncate on a phone.
 */
export function ShellBreadcrumb({
  backlogs: backlogsProp,
  views: viewsProp,
}: {
  backlogs?: ShellBacklogRef[];
  views?: ShellViewRef[];
} = {}) {
  const shell = useShellData();
  const backlogs = backlogsProp ?? shell.backlogs;
  const views = viewsProp ?? shell.views;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const backlogKeys = new Map(backlogs.map((backlog) => [backlog.id, backlog.key]));
  const segments = deriveBreadcrumb({
    pathname,
    search: new URLSearchParams(searchParams.toString()),
    backlogs,
    views: views.flatMap((view) => {
      const backlogKey = view.backlogId ? backlogKeys.get(view.backlogId) : undefined;
      return backlogKey ? [{ id: view.id, name: view.name, backlogKey }] : [];
    }),
  });
  const last = segments.length - 1;

  return (
    <nav aria-label="Fil d’Ariane" className="min-w-0" data-slot="shell-breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-muted-foreground">
        {segments.map((segment, index) => (
          <Fragment key={`${index}:${segment.label}`}>
            {index > 0 && (
              <li aria-hidden="true" className="select-none">
                /
              </li>
            )}
            <li className="min-w-0 break-words">
              {segment.href ? (
                <Link
                  href={segment.href}
                  className="rounded-sm text-foreground/80 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  data-slot={index === 0 ? "shell-breadcrumb-parent" : undefined}
                >
                  {segment.label}
                </Link>
              ) : (
                <span
                  aria-current={index === last ? "page" : undefined}
                  data-slot={
                    index === last
                      ? "shell-breadcrumb-current"
                      : index === 0
                        ? "shell-breadcrumb-parent"
                        : undefined
                  }
                >
                  {segment.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
