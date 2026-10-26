import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The row under the page header that holds a page's display controls, ruled
 * off from the content, as the Backlog's filter bar.
 */
export function PageToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-slot="page-toolbar"
      className={cn("flex flex-wrap items-center gap-2 border-b border-border px-4 pb-3 sm:px-6", className)}
    >
      {children}
    </div>
  );
}
