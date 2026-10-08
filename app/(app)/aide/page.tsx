import type { Metadata } from "next";
import { HelpGuide } from "@/components/help/help-guide";
import { GuideToc } from "@/components/help/guide-toc";

export const metadata: Metadata = { title: "Aide — Jiroo" };

/** Functional user guide (static content, inside the authenticated shell). */
export default function HelpPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-8 print:max-w-none print:p-0">
      <header className="mb-6 space-y-1">
        <h1 className="t-h1">Guide d’utilisation</h1>
        <p className="t-body text-muted-foreground">
          Les fonctions de Jiroo, section par section : à quoi elles servent et comment s’en servir.
        </p>
      </header>
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <GuideToc />
        <article className="min-w-0 max-w-3xl">
          <HelpGuide />
        </article>
      </div>
    </div>
  );
}
