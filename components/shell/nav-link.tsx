"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Active-aware sidebar nav link.
 * Highlights when the current pathname matches `href` exactly
 * or starts with `href + "/"`.
 */
export function NavLink({
  href,
  children,
  active: activeOverride,
  ariaLabel,
  collapsed = false,
  title,
  onNavigate,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  ariaLabel?: string;
  collapsed?: boolean;
  title?: string;
  onNavigate?: ComponentProps<typeof Link>["onNavigate"];
}) {
  const pathname = usePathname();
  const routeActive = pathname === href || pathname.startsWith(href + "/");
  const active = activeOverride ?? routeActive;

  return (
    <Link
      data-slot="nav-link"
      href={href}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      title={title}
      onNavigate={onNavigate}
      className={cn(
        "flex items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-sm hover:bg-[var(--muted)]",
        collapsed && "justify-center px-0",
        active && "bg-[var(--accent-subtle)] font-medium",
      )}
    >
      {children}
    </Link>
  );
}
