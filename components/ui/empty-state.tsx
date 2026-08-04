import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function EmptyState({
  action,
  className,
  description,
  icon,
  title,
}: {
  action?: ReactNode;
  className?: string;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className={cn("flex max-w-md flex-col items-center text-center", className)}>
      <div
        aria-hidden="true"
        className="mb-3 flex size-10 items-center justify-center rounded-full bg-[var(--surface-2)] text-muted-foreground"
      >
        {icon}
      </div>
      <h2 className="t-h2">{title}</h2>
      <p className="mt-1.5 t-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
