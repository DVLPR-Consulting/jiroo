"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDensity } from "@/components/theme/density-provider";
import { useViewUrlState } from "@/components/shell/view-url-state";
import type { GroupKey, ViewState } from "@/lib/items/filter";

type DisplayView = "backlog" | "board" | "list" | "tree";
type GroupOption = { value: Exclude<GroupKey, "parent"> | ""; label: string };

const NONE: GroupOption = { value: "", label: "Aucun" };
const PRIORITY: GroupOption = { value: "priority", label: "Priorité" };
const ASSIGNEE: GroupOption = { value: "assignee", label: "Assigné" };
const COMPONENT: GroupOption = { value: "component", label: "Composant" };
const STATUS: GroupOption = { value: "status", label: "Statut" };

// Status is the board's columns, so it never groups the board; the tree is
// arranged by its own hierarchy.
const OPTIONS_BY_VIEW: Record<DisplayView, GroupOption[]> = {
  backlog: [STATUS, PRIORITY, ASSIGNEE, COMPONENT, NONE],
  board: [PRIORITY, ASSIGNEE, COMPONENT, NONE],
  list: [STATUS, PRIORITY, ASSIGNEE, COMPONENT, NONE],
  tree: [],
};

const DENSITIES = [
  { value: "comfy", label: "Confort" },
  { value: "compact", label: "Compact" },
] as const;

/** Radix radio items need a non-empty value: « Aucun » travels as this one. */
const NO_GROUP = "none";

/**
 * « Affichage » (JIR-74): the view's grouping (the options of the current
 * view) and the Confort / Compact density, in one menu. The trigger recalls
 * the current density.
 */
export function DisplayMenu({
  view,
  state,
}: {
  view: DisplayView;
  state: ViewState;
}) {
  const viewUrl = useViewUrlState();
  const { density, setDensity } = useDensity();

  const options = OPTIONS_BY_VIEW[view];
  const group = options.some((option) => option.value === state.group)
    ? (state.group ?? "")
    : "";
  const densityLabel = DENSITIES.find((option) => option.value === density)?.label;

  function setGroup(next: string) {
    viewUrl.replace((params) => {
      if (next && next !== NO_GROUP) params.set("group", next);
      else params.delete("group");
    }, { scroll: false });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-[13px] text-foreground transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          <span>
            Affichage{" "}
            <span className="text-muted-foreground">· {densityLabel}</span>
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {options.length > 0 ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Grouper par</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                aria-label="Grouper par"
                value={group || NO_GROUP}
                onValueChange={setGroup}
              >
                {options.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value || NO_GROUP}
                    value={option.value || NO_GROUP}
                  >
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Densité</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            aria-label="Densité"
            value={density}
            onValueChange={(next) => setDensity(next as (typeof DENSITIES)[number]["value"])}
          >
            {DENSITIES.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
