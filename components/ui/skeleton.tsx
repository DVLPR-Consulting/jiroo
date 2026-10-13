import * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-2)]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The announced region around a placeholder: one busy `status` named after
 * what is loading (« Chargement de … »); its bars stay hidden from assistive
 * technologies. `name` tags the placeholder's shape (`data-skeleton`).
 */
function SkeletonRegion({
  label,
  name,
  className,
  children,
}: {
  label: string;
  name: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className={className}
      data-skeleton={name}
      role="status"
    >
      {children}
    </div>
  );
}

export { Skeleton, SkeletonRegion };
