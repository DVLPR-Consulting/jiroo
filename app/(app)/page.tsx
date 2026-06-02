import { getSession } from "@/lib/auth/session";
import { SignOutButton } from "@/components/auth/sign-out-button";

export default async function AppHome() {
  const session = await getSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "—";
  const twoFactorEnabled =
    (session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled ?? false;
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-10">
      {!twoFactorEnabled && (
        <a
          href="/2fa/enroll"
          className="block rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--accent-subtle)] p-3 t-sm"
        >
          🔒 Sécurisez votre compte — configurer la double authentification
        </a>
      )}
      <h1 className="t-h1">Bonjour {session?.user.name ?? ""}</h1>
      <p className="t-sm text-muted-foreground">
        Connecté en tant que {session?.user.email} — rôle {role}.
      </p>
      <SignOutButton />
    </main>
  );
}
