"use client";

import { useState } from "react";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  recoveryCodesClipboardText,
  recoveryCodesFileContent,
  recoveryCodesFileName,
} from "@/lib/auth/recovery-codes-file";

function download(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously can cancel the download in Safari and Firefox; the
  // URL must not outlive the click by more than this grace period.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * Recovery codes shown once at enrollment, with copy and .txt download done
 * entirely in the browser: no request, no logging, nothing persisted.
 */
export function RecoveryCodesPanel({
  codes,
  account,
}: {
  codes: readonly string[];
  account: string | null;
}) {
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(recoveryCodesClipboardText(codes));
      setStatus("Codes copiés.");
    } catch {
      setStatus("Copie impossible : sélectionnez les codes ci-dessus et copiez-les manuellement.");
    }
  }

  function save() {
    const date = new Date();
    const fileName = recoveryCodesFileName(date);
    try {
      download(fileName, recoveryCodesFileContent({ account, codes, date }));
      setStatus(`Fichier ${fileName} téléchargé.`);
    } catch {
      setStatus("Téléchargement impossible : copiez les codes ou notez-les.");
    }
  }

  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--accent-subtle)] p-3">
      <p className="t-meta" id="recovery-codes-title">Codes de récupération — conservez-les</p>
      <div
        className="grid grid-cols-2 gap-1.5 select-all"
        role="group"
        aria-labelledby="recovery-codes-title"
      >
        {codes.map((c) => (
          <span key={c} className="item-key">{c}</span>
        ))}
      </div>
      <p className="t-sm font-medium">
        Ne partagez ni ces codes ni la clé : ils donnent accès à votre compte.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          <CopyIcon aria-hidden="true" />
          Copier les codes
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={save}>
          <DownloadIcon aria-hidden="true" />
          Télécharger (.txt)
        </Button>
      </div>
      <p role="status" aria-live="polite" className="t-sm min-h-5 text-muted-foreground">
        {status}
      </p>
    </div>
  );
}
