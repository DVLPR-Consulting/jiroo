import { getSession } from "@/lib/auth/session";
import { SignOutButton } from "@/components/auth/sign-out-button";

export default async function AppHome() {
  const session = await getSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "—";
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-10">
      <h1 className="t-h1">Bonjour {session?.user.name ?? ""}</h1>
      <p className="t-sm muted">
        Connecté en tant que {session?.user.email} — rôle {role}.
      </p>
      <SignOutButton />
    </main>
  );
}
