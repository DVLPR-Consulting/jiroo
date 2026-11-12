"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleUserRound, KeyRound, LogOut, Plug, SlidersHorizontal } from "lucide-react";
import { InitialsAvatar } from "@/components/jiroo/avatar";
import { ChangePasswordDialog } from "@/components/shell/change-password-dialog";
import { UserPreferencesDialog } from "@/components/shell/user-preferences-dialog";
import { UserProfileDialog } from "@/components/shell/user-profile-dialog";
import { signOut } from "@/lib/auth/client";
import { prepareSignOut } from "@/lib/autosave/sign-out";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { loadPage } from "@/lib/navigation/load-page";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur Jiroo",
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
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  const [profileOpen, setProfileOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    if (!(await prepareSignOut())) return;
    await signOut();
    loadPage("/login");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            data-sidebar-user-trigger
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
            <span
              data-sidebar-label
              className={collapsed ? "sr-only" : "flex min-w-0 flex-col leading-tight"}
            >
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-[11px] text-muted-foreground">{roleLabel}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          className="min-w-44 w-[var(--radix-dropdown-menu-trigger-width)]"
        >
          <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
            <CircleUserRound className="size-4" />
            Profil
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPreferencesOpen(true)}>
            <SlidersHorizontal className="size-4" />
            Préférences
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
            <KeyRound className="size-4" />
            Changer mon mot de passe
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push("/jetons")}>
            <Plug className="size-4" />
            Jetons d’accès
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleSignOut}>
            <LogOut className="size-4" />
            Déconnexion
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <UserProfileDialog open={profileOpen} onOpenChange={setProfileOpen} user={user} />
      <UserPreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen} />
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  );
}
