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

export { Skeleton };
