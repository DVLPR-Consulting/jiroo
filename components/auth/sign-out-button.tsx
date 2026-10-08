"use client";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/client";
import { prepareSignOut } from "@/lib/autosave/sign-out";
import { loadPage } from "@/lib/navigation/load-page";

export function SignOutButton() {
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        if (!(await prepareSignOut())) return;
        await signOut();
        loadPage("/login");
      }}
    >
      Se déconnecter
    </Button>
  );
}
