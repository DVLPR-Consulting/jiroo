"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { InitialsAvatar } from "@/components/jiroo/avatar";
import { signOut } from "@/lib/auth/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  contributor: "Contributeur",
  viewer: "Lecteur",
};

export function UserCard({
  user,
  collapsed = false,
}: {
  user: { name: string; email: string; role: string };
  collapsed?: boolean;
}) {
  const router = useRouter();
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Profil de ${user.name}`}
          title={collapsed ? user.name : undefined}
          className={[
            "flex w-full items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-left text-sm hover:bg-[var(--surface)]",
            collapsed ? "justify-center px-0" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <InitialsAvatar name={user.name} hue={3} />
          <span className={collapsed ? "sr-only" : "flex min-w-0 flex-col leading-tight"}>
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-[11px] text-muted-foreground">{roleLabel}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        <DropdownMenuItem onSelect={handleSignOut}>
          <LogOut className="size-4" />
          Déconnexion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
