"use client";

import { createContext, useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Unfolds the enclosing panel, e.g. when a shortcut (« a ») asks for one of
 * its fields: the click, the stored preference and the shortcut share one
 * expansion state. Null outside a panel.
 */
export const PanelExpandContext = createContext<(() => void) | null>(null);

const STORAGE_PREFIX = "jiroo:item-drawer-panel:";

function readCollapsed(id: string): boolean | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_PREFIX + id);
    return stored === null ? null : stored === "collapsed";
  } catch {
    return null;
  }
}

function writeCollapsed(id: string, collapsed: boolean) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + id, collapsed ? "collapsed" : "expanded");
  } catch {
    // Storage unavailable (private mode, blocked site data): keep it in memory.
  }
}

/**
 * A collapsible card of the item drawer's side column (« Détails »,
 * « Développement »), as in Jira. Whether it is folded is remembered on this
 * device, per panel.
 */
export function CollapsiblePanel({
  id,
  title,
  children,
  className,
}: {
  /** Stable storage id, e.g. "details". */
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const contentId = useId();
  const [expanded, setExpanded] = useState(true);
  const expand = useCallback(() => {
    setExpanded(true);
    writeCollapsed(id, false);
  }, [id]);

  // Read the device preference after mount: the server renders it expanded.
  useEffect(() => {
    const collapsed = readCollapsed(id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only preference
    if (collapsed !== null) setExpanded(!collapsed);
  }, [id]);

  return (
    <section
      aria-label={title}
      className={cn(
        "rounded-[var(--radius-md)] border border-border bg-[var(--surface)]",
        className,
      )}
    >
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => {
            const next = !expanded;
            setExpanded(next);
            writeCollapsed(id, !next);
          }}
          className={cn(
            "flex h-11 w-full items-center justify-between rounded-[var(--radius-md)] px-3.5 text-left text-sm font-semibold text-foreground outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            expanded && "rounded-b-none border-b border-border",
          )}
        >
          {title}
          <ChevronDown
            aria-hidden
            className={cn("size-4 transition-transform motion-reduce:transition-none", expanded && "rotate-180")}
          />
        </button>
      </h3>
      <div id={contentId} hidden={!expanded}>
        <PanelExpandContext.Provider value={expand}>{children}</PanelExpandContext.Provider>
      </div>
    </section>
  );
}
