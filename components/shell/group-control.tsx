"use client";

import { usePathname, useRouter } from "next/navigation";
import type { GroupKey, ViewState } from "@/lib/items/filter";

type DisplayView = "board" | "list" | "tree";
type GroupOption = { value: Exclude<GroupKey, "parent"> | ""; label: string };

const NONE: GroupOption = { value: "", label: "Aucun" };
const PRIORITY: GroupOption = { value: "priority", label: "Priorité" };
const ASSIGNEE: GroupOption = { value: "assignee", label: "Assigné" };
const COMPONENT: GroupOption = { value: "component", label: "Composant" };
const STATUS: GroupOption = { value: "status", label: "Statut" };

const OPTIONS_BY_VIEW: Record<Exclude<DisplayView, "tree">, GroupOption[]> = {
  board: [PRIORITY, ASSIGNEE, COMPONENT, NONE],
  list: [STATUS, PRIORITY, ASSIGNEE, COMPONENT, NONE],
};

export function GroupControl({
  view,
  state,
  currentParams,
}: {
  view: DisplayView;
  state: ViewState;
  currentParams: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();

  if (view === "tree") return null;

  const options = OPTIONS_BY_VIEW[view];
  const value = options.some((option) => option.value === state.group)
    ? (state.group ?? "")
    : "";

  return (
    <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span>Grouper :</span>
      <select
        aria-label="Grouper par"
        value={value}
        onChange={(event) => {
          const sp = new URLSearchParams(currentParams);
          if (event.target.value) sp.set("group", event.target.value);
          else sp.delete("group");
          const query = sp.toString();
          router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        }}
        className="h-7 rounded-[var(--radius-sm)] border border-border bg-[var(--surface)] px-2 text-xs text-foreground"
      >
        {options.map((option) => (
          <option key={option.value || "none"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
