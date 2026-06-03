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

export function BacklogSelector({ backlogs }: { backlogs: Backlog[] }) {
  const params = useParams<{ key?: string }>();
  const router = useRouter();

  const activeKey =
    typeof params.key === "string" ? params.key.toUpperCase() : undefined;
  const activeBacklog = backlogs.find((b) => b.key === activeKey);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-sm hover:bg-[var(--muted)]"
        >
          {activeBacklog ? (
            <>
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
                style={{ background: activeBacklog.color }}
              >
                {activeBacklog.key}
              </span>
              <span className="truncate">{activeBacklog.name}</span>
            </>
          ) : (
            <span className="truncate text-muted-foreground">Choisir un backlog</span>
          )}
          <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {backlogs.map((b) => {
          const isActive = b.key === activeKey;
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
