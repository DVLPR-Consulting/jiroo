import { handleRepoWebhook } from "@/lib/repo-webhooks/handle-webhook";

// Node runtime: node:crypto verifies the signature on the raw body (JIR-95).
export const runtime = "nodejs";

/** GitLab webhook of a repository connection; see handleRepoWebhook. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params;
  return handleRepoWebhook("gitlab", connectionId, request);
}
