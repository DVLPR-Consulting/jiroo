"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Active-aware sidebar nav link.
 * Highlights when the current pathname matches `href` exactly
 * or starts with `href + "/"`.
 */
export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-sm hover:bg-[var(--muted)]",
        active && "bg-[var(--accent-subtle)] font-medium",
      )}
    >
      {children}
    </Link>
  );
}
