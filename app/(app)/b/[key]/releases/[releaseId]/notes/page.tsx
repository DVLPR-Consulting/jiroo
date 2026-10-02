import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ReleaseNotesEditor } from "@/components/releases/release-notes-editor";
import { getBacklogCapabilities } from "@/lib/auth/accessible-backlogs";
import { requireAppPageSession } from "@/lib/auth/session";
import { buildReleaseNotesMarkdown } from "@/lib/releases/notes";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import { getReleaseNotesModel } from "@/lib/services/release-notes";
import { releaseNotesOptionsSchema } from "@/lib/validation/release";

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function fileSlug(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `notes-de-release-${slug}` : "notes-de-release";
}

// Release notes are readable by anyone who can browse the backlog and are
// regenerated from the version's current items on each view (Jira behaviour).
export default async function ReleaseNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string; releaseId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ key, releaseId }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(releaseId).success) notFound();

  const session = await requireAppPageSession();
  const backlog = await getBacklogByKeyForUser(key, session.user.id);
  if (!backlog || backlog.archivedAt) notFound();
  const capabilities = await getBacklogCapabilities(session.user.id, backlog.id);
  if (!capabilities) notFound();

  const model = await getReleaseNotesModel({ backlogId: backlog.id, releaseId });
  if (!model) notFound();

  const options = releaseNotesOptionsSchema.parse({
    includeIncomplete: firstValue(query.incomplete) === "1",
    includeDescription: firstValue(query.description) !== "0",
  });
  const title = `Notes de release — ${model.releaseName}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <Link
        href={`/b/${backlog.key}/releases/${releaseId}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Retour à la version
      </Link>
      <header className="space-y-1">
        <h1 className="t-h1">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Notes générées à partir des éléments actuels de la version, regroupés par nature.
          Les modifications restent locales : copiez ou téléchargez le résultat.
        </p>
      </header>
      <ReleaseNotesEditor
        initialMarkdown={buildReleaseNotesMarkdown(model, options)}
        fileBaseName={fileSlug(model.releaseName)}
        title={title}
        options={options}
      />
    </div>
  );
}
