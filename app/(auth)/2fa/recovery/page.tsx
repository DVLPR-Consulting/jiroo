"use client";
import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadPage } from "@/lib/navigation/load-page";

export default function RecoveryPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await authClient.twoFactor.verifyBackupCode({ code: code.trim(), trustDevice: true });
    setLoading(false);
    if (error) {
      setError("Code de récupération invalide.");
      return;
    }
    loadPage("/");
  }

  return (
    <AuthCard subtitle="Code de récupération">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="code">Code de récupération</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="one-time-code"
            required
          />
        </div>
        {error && (
          <p className="t-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Vérification…" : "Valider"}
        </Button>
      </form>
      <div className="mt-6 text-center">
        <Link href="/2fa" className="t-sm text-[var(--primary)] hover:underline">
          Revenir au code à 6 chiffres
        </Link>
      </div>
    </AuthCard>
  );
}
