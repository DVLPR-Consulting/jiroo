import * as React from "react";

export function AuthCard({
  subtitle,
  children,
}: {
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-[400px] max-w-[calc(100vw-2rem)] rounded-[var(--radius-xl)] border border-border bg-[var(--surface)] p-8 shadow">
      <div className="mb-6 text-center">
        <p className="t-h1">
          Jir<span className="text-[var(--primary)]">oo</span>
        </p>
        {subtitle ? (
          <p className="t-sm mt-1 text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
