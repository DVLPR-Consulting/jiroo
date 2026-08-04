"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginHelp } from "@/components/auth/login-help";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data, error } = await authClient.signIn.email({ email, password });
    setLoading(false);
    // If 2FA is required, the client twoFactor plugin redirects to /2fa via onTwoFactorRedirect.
    if (error) {
      setError("E-mail ou mot de passe incorrect.");
      return;
    }
    const requiresChallenge =
      typeof data === "object" &&
      data !== null &&
      "twoFactorRedirect" in data &&
      data.twoFactorRedirect === true;
    if (requiresChallenge) return;
    const alreadyEnrolled =
      typeof data === "object" &&
      data !== null &&
      "user" in data &&
      typeof data.user === "object" &&
      data.user !== null &&
      "twoFactorEnabled" in data.user &&
      data.user.twoFactorEnabled === true;
    router.push(alreadyEnrolled ? "/" : "/2fa/enroll");
  }

  return (
    <AuthCard subtitle="Cour de cassation · gestion des tickets">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error && (
          <p className="t-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Connexion…" : "Se connecter"}
        </Button>
      </form>
      <LoginHelp />
      <p className="t-meta mt-6 text-center">Accès réservé · actions journalisées</p>
    </AuthCard>
  );
}
