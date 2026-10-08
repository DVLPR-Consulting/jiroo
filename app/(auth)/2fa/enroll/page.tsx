"use client";
import { useState } from "react";
import QRCode from "qrcode";
import { authClient } from "@/lib/auth/client";
import { AuthCard } from "@/components/auth/auth-card";
import { OtpInput } from "@/components/auth/otp-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadPage } from "@/lib/navigation/load-page";

type Setup = { qr: string; secret: string; backupCodes: string[] };

export default function EnrollPage() {
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");
  const [attempt, setAttempt] = useState(0);

  async function startEnroll(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data, error } = await authClient.twoFactor.enable({ password });
    setLoading(false);
    if (error || !data) {
      setError("Mot de passe incorrect.");
      return;
    }
    try {
      const totpURI = data.totpURI;
      const secret = /secret=([^&]+)/.exec(totpURI ?? "")?.[1] ?? "";
      const qr = await QRCode.toDataURL(totpURI);
      setSetup({ qr, secret, backupCodes: data.backupCodes });
    } catch {
      setError("Impossible de générer le QR code. Réessayez.");
    }
  }

  async function confirm() {
    if (!saved || !/^\d{6}$/.test(code) || verifying) return;
    setError(null);
    setVerifying(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setVerifying(false);
    if (error) {
      setError("Code invalide. Réessayez.");
      setCode("");
      setAttempt((a) => a + 1);
      return;
    }
    loadPage("/");
  }

  if (!setup) {
    return (
      <AuthCard subtitle="Configurer la double authentification">
        <form onSubmit={startEnroll} className="space-y-4">
          <p className="t-sm text-muted-foreground">Confirmez votre mot de passe pour activer la 2FA.</p>
          <div className="space-y-1.5">
            <Label htmlFor="password">Mot de passe</Label>
            <Input id="password" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          {error && <p className="t-sm" style={{ color: "var(--danger)" }}>{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "…" : "Continuer"}
          </Button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard subtitle="Configurer la double authentification">
      <div className="space-y-4">
        <p className="t-sm text-center text-muted-foreground">
          Scannez ce QR code avec votre application d&apos;authentification.
        </p>
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR code 2FA" width={176} height={176}
            className="rounded-[var(--radius)] border border-border" />
        </div>
        <p className="t-sm text-center text-muted-foreground">
          Clé manuelle : <span className="item-key select-all">{setup.secret}</span>
        </p>

        <div className="rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--accent-subtle)] p-3">
          <p className="t-meta mb-2">Codes de récupération — conservez-les</p>
          <div className="grid grid-cols-2 gap-1.5">
            {setup.backupCodes.map((c) => (
              <span key={c} className="item-key">{c}</span>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 t-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          J&apos;ai enregistré mes codes de récupération
        </label>

        <div>
          <p className="t-sm mb-2 text-muted-foreground">Entrez un code de votre application pour activer :</p>
          <OtpInput
            key={attempt}
            onComplete={() => undefined}
            onValueChange={setCode}
            autoSubmit={false}
            autoFocus={false}
          />
        </div>
        <Button
          type="button"
          className="w-full"
          disabled={!saved || code.length !== 6 || verifying}
          onClick={confirm}
        >
          {verifying ? "Activation…" : "Activer et continuer"}
        </Button>
        {error && <p className="t-sm text-center" style={{ color: "var(--danger)" }}>{error}</p>}
      </div>
    </AuthCard>
  );
}
