"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/client";
import { prepareSignOut } from "@/lib/autosave/sign-out";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        if (!(await prepareSignOut())) return;
        await signOut();
        router.push("/login");
      }}
    >
      Se déconnecter
    </Button>
  );
}
