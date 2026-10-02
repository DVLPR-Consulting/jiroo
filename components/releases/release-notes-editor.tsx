"use client";

import { useId, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ReleaseNotesOptions } from "@/lib/validation/release";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function download(fileName: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously can cancel the download in Safari and Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * Release notes editor: generated Markdown edited locally (never saved, as Jira
 * regenerates notes on each view), previewed with react-markdown WITHOUT raw
 * HTML, and exported as Markdown or as HTML produced from the preview.
 */
export function ReleaseNotesEditor({
  initialMarkdown,
  fileBaseName,
  title,
  options,
}: {
  initialMarkdown: string;
  fileBaseName: string;
  title: string;
  options: ReleaseNotesOptions;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const prefix = useId();
  const previewRef = useRef<HTMLDivElement>(null);
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [generated, setGenerated] = useState(initialMarkdown);
  const [status, setStatus] = useState("");
  const [regenerating, startRegeneration] = useTransition();
  if (generated !== initialMarkdown) {
    setGenerated(initialMarkdown);
    setMarkdown(initialMarkdown);
  }

  function changeOptions(next: ReleaseNotesOptions) {
    if (
      markdown !== initialMarkdown &&
      !window.confirm("Changer les options régénère les notes et efface vos modifications. Continuer ?")
    ) {
      return;
    }
    const query = new URLSearchParams();
    if (next.includeIncomplete) query.set("incomplete", "1");
    if (!next.includeDescription) query.set("description", "0");
    const search = query.toString();
    startRegeneration(() => router.replace(search ? `${pathname}?${search}` : pathname));
  }

  const previewHtml = () => previewRef.current?.innerHTML ?? "";

  async function copy(content: string, success: string) {
    try {
      await navigator.clipboard.writeText(content);
      setStatus(success);
    } catch {
      setStatus("Copie impossible.");
    }
  }

  function save(fileName: string, type: string, content: string) {
    try {
      download(fileName, type, content);
      setStatus(`Fichier ${fileName} téléchargé.`);
    } catch {
      setStatus("Téléchargement impossible.");
    }
  }

  return (
    <div className="space-y-6">
      <fieldset
        className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
        disabled={regenerating}
        aria-busy={regenerating || undefined}
      >
        <legend className="sr-only">Options des notes</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={options.includeIncomplete}
            onChange={(event) => changeOptions({ ...options, includeIncomplete: event.target.checked })}
          />
          Inclure les éléments non terminés
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={options.includeDescription}
            onChange={(event) => changeOptions({ ...options, includeDescription: event.target.checked })}
          />
          Inclure la description de la version
        </label>
        <span className="text-xs text-muted-foreground">
          Changer une option régénère les notes.
        </span>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void copy(markdown, "Markdown copié.")}>
          Copier le Markdown
        </Button>
        <Button type="button" variant="outline" onClick={() => void copy(previewHtml(), "HTML copié.")}>
          Copier le HTML
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => save(`${fileBaseName}.md`, "text/markdown;charset=utf-8", markdown)}
        >
          Télécharger .md
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const html = `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<title>${escapeHtml(title)}</title>\n</head>\n<body>\n${previewHtml()}\n</body>\n</html>\n`;
            save(`${fileBaseName}.html`, "text/html;charset=utf-8", html);
          }}
        >
          Télécharger .html
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setMarkdown(initialMarkdown);
            setStatus("Notes régénérées.");
          }}
        >
          Réinitialiser
        </Button>
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {status}
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-markdown`}>Notes de release (Markdown)</Label>
          <textarea
            id={`${prefix}-markdown`}
            className="min-h-96 w-full rounded-lg border border-input bg-transparent p-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
          />
        </div>
        <section aria-labelledby={`${prefix}-preview`} className="space-y-2">
          <h2 id={`${prefix}-preview`} className="text-sm font-medium">
            Aperçu
          </h2>
          <div
            ref={previewRef}
            className="rounded-lg border p-4 text-sm leading-relaxed text-foreground [&_a]:text-[var(--primary)] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--muted)] [&_code]:px-1 [&_h1]:t-h1 [&_h2]:mt-4 [&_h2]:t-h2 [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          </div>
        </section>
      </div>
    </div>
  );
}
