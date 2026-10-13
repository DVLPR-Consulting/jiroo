import type { DevRefKind, RepoProvider } from "@/lib/repo-webhooks/events";

/**
 * Links and identities of webhook references (JIR-95), built from the
 * connection's own settings rather than from URLs found in the payload: a
 * stored link always points at the connected forge and repository.
 */

type RefLocation = {
  provider: RepoProvider;
  instanceUrl: string;
  repositoryPath: string;
  kind: DevRefKind;
  id: string;
};

function encodePath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

export function buildRefUrl({ provider, instanceUrl, repositoryPath, kind, id }: RefLocation): string {
  const instance = new URL(instanceUrl);
  const base = `${instance.origin}${instance.pathname.replace(/\/+$/, "")}/${encodePath(repositoryPath)}`;
  const section = provider === "gitlab" ? "/-" : "";
  switch (kind) {
    case "pr":
      return provider === "gitlab"
        ? `${base}${section}/merge_requests/${encodeURIComponent(id)}`
        : `${base}/pull/${encodeURIComponent(id)}`;
    case "commit":
      return `${base}${section}/commit/${encodeURIComponent(id)}`;
    case "branch":
      return `${base}${section}/tree/${encodePath(id)}`;
  }
}

/**
 * Repository-scoped identity stored in `item_refs.external_id`: the whole
 * instance (host and sub-path, so two GitLab instances under one host stay
 * apart), the repository and the reference. It depends only on where the
 * repository lives, so reconnecting the same repository keeps it.
 */
export function externalRefId({
  instanceUrl,
  repositoryPath,
  id,
}: Pick<RefLocation, "instanceUrl" | "repositoryPath" | "id">): string {
  const instance = new URL(instanceUrl);
  return `${instance.host}${instance.pathname.replace(/\/+$/, "")}/${repositoryPath}#${id}`;
}
