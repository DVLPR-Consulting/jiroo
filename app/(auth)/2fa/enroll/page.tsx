"use client";
import { useRef, useState } from "react";
import QRCode from "qrcode";
import { authClient } from "@/lib/auth/client";
import { AuthCard } from "@/components/auth/auth-card";
import { OtpInput } from "@/components/auth/otp-input";
import { RecoveryCodesPanel } from "@/components/auth/recovery-codes-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountFromTotpUri } from "@/lib/auth/recovery-codes-file";
import { loadPage } from "@/lib/navigation/load-page";

type Setup = { qr: string; secret: string; account: string | null; backupCodes: string[] };

export default function EnrollPage() {
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedError, setSavedError] = useState(false);
  const savedRef = useRef<HTMLInputElement>(null);
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
      setSetup({ qr, secret, account: accountFromTotpUri(totpURI), backupCodes: data.backupCodes });
    } catch {
      setError("Impossible de générer le QR code. Réessayez.");
    }
  }

  async function confirm() {
    // The acknowledgement stays mandatory, but the button explains it instead of
    // silently staying disabled.
    if (!saved) {
      setSavedError(true);
      savedRef.current?.focus();
      return;
    }
    if (!/^\d{6}$/.test(code) || verifying) return;
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

        <RecoveryCodesPanel codes={setup.backupCodes} account={setup.account} />

        <div className="space-y-1">
          <label className="flex items-center gap-2 t-sm">
            <input
              ref={savedRef}
              type="checkbox"
              checked={saved}
              onChange={(e) => {
                setSaved(e.target.checked);
                if (e.target.checked) setSavedError(false);
              }}
              aria-required="true"
              aria-invalid={savedError || undefined}
              aria-describedby={savedError ? "recovery-saved-error" : undefined}
            />
            <span>
              J&apos;ai enregistré mes codes de récupération{" "}
              <span aria-hidden="true" style={{ color: "var(--danger)" }}>*</span>
              <span className="sr-only">(obligatoire)</span>
            </span>
          </label>
          {savedError && (
            <p id="recovery-saved-error" className="t-sm" style={{ color: "var(--danger)" }}>
              Cochez cette case après avoir enregistré vos codes de récupération.
            </p>
          )}
        </div>

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
          disabled={code.length !== 6 || verifying}
          onClick={confirm}
        >
          {verifying ? "Activation…" : "Activer et continuer"}
        </Button>
        {error && <p className="t-sm text-center" style={{ color: "var(--danger)" }}>{error}</p>}
      </div>
    </AuthCard>
  );
}
