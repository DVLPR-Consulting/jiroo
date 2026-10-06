"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Horizontally scrollable tab row (JIR-63). On a phone the backlog tabs are
 * wider than the screen: the row scrolls inside the view bar padding instead
 * of running into the edge, and brings the current tab into view whenever it
 * changes.
 */
export function ViewTabsScroller({
  active,
  className,
  children,
}: {
  /** The current tab; re-run the reveal when it changes. */
  active: string;
  className: string;
  children: ReactNode;
}) {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current) return;
    const row = nav.getBoundingClientRect();
    const tab = current.getBoundingClientRect();
    if (tab.left < row.left) nav.scrollLeft -= row.left - tab.left;
    else if (tab.right > row.right) nav.scrollLeft += tab.right - row.right;
  }, [active]);

  return (
    <nav ref={navRef} aria-label="Vues du backlog" className={className}>
      {children}
    </nav>
  );
}
