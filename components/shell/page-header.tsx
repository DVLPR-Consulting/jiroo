import type { ReactNode } from "react";
import { ShellBreadcrumb } from "@/components/shell/shell-breadcrumb";
import { cn } from "@/lib/utils";

/**
 * Page header (JIR-74): the breadcrumb above the page title, page actions on
 * the right. Pages that keep their own title (a release, a report) render
 * the breadcrumb alone.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-4 pt-4 pb-3 sm:px-6",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <ShellBreadcrumb />
        {title ? <h1 className="t-h1 break-words">{title}</h1> : null}
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2" data-slot="page-actions">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
