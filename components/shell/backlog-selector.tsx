"use client";

import { useParams, useRouter } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Backlog = { id: string; key: string; name: string; color: string };

export function BacklogSelector({
  backlogs,
  collapsed = false,
  activeKey: activeKeyOverride,
}: {
  backlogs: Backlog[];
  collapsed?: boolean;
  activeKey?: string;
}) {
  const params = useParams<{ key?: string }>();
  const router = useRouter();

  const routeKey = typeof params.key === "string" ? params.key.toUpperCase() : undefined;
  const activeKey = activeKeyOverride?.toUpperCase() ?? routeKey;
  const activeBacklog = backlogs.find((b) => b.key.toUpperCase() === activeKey);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            activeBacklog
              ? `Backlog ${activeBacklog.key} — ${activeBacklog.name}`
              : "Choisir un backlog"
          }
          title={collapsed ? activeBacklog?.name ?? "Choisir un backlog" : undefined}
          className={[
            "flex w-full items-center gap-2 rounded-[var(--radius)] border border-border bg-[var(--surface)] p-1.5 text-sm hover:bg-[var(--muted)]",
            collapsed ? "justify-center" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {activeBacklog ? (
            <>
              <span
                className="inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-[10px] font-semibold text-white"
                style={{ background: activeBacklog.color }}
              >
                {activeBacklog.key}
              </span>
              <span className={collapsed ? "sr-only" : "truncate"}>{activeBacklog.name}</span>
            </>
          ) : (
            <span className="truncate text-muted-foreground">Choisir un backlog</span>
          )}
          {!collapsed && (
            <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {backlogs.map((b) => {
          const isActive = b.key.toUpperCase() === activeKey;
          return (
            <DropdownMenuItem
              key={b.id}
              onSelect={() => router.push(`/b/${b.key}`)}
              className={isActive ? "bg-[var(--accent-subtle)] font-medium" : undefined}
            >
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
                style={{ background: b.color }}
              >
                {b.key}
              </span>
              <span className="truncate">{b.name}</span>
              {isActive && <Check className="ml-auto size-4 shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
