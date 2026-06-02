"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { AuthCard } from "@/components/auth/auth-card";
import { OtpInput } from "@/components/auth/otp-input";

export default function TwoFactorPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [attempt, setAttempt] = useState(0);

  async function verify(code: string) {
    setError(null);
    setVerifying(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code, trustDevice: true });
    setVerifying(false);
    if (error) {
      setError("Code invalide. Réessayez.");
      setAttempt((a) => a + 1);
      return;
    }
    router.push("/");
  }

  return (
    <AuthCard subtitle="Vérification en deux étapes">
      <p className="t-sm mb-4 text-center text-muted-foreground">
        Saisissez le code à 6 chiffres de votre application d&apos;authentification.
      </p>
      <OtpInput key={attempt} onComplete={verify} />
      {verifying && <p className="t-sm mt-3 text-center text-muted-foreground">Vérification…</p>}
      {error && (
        <p className="t-sm mt-3 text-center" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-col items-center gap-2">
        <Link href="/2fa/recovery" className="t-sm text-[var(--primary)] hover:underline">
          Utiliser un code de récupération
        </Link>
        <Link href="/login" className="t-sm text-muted-foreground hover:underline">
          Retour à la connexion
        </Link>
      </div>
    </AuthCard>
  );
}
