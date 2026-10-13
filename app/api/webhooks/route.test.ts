// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sealSecret, secretBoxKey } from "@/lib/crypto/secret-box";
import githubPing from "@/lib/repo-webhooks/fixtures/github-ping.json";
import githubPrOpened from "@/lib/repo-webhooks/fixtures/github-pull-request-opened.json";
import gitlabMergeRequest from "@/lib/repo-webhooks/fixtures/gitlab-merge-request.json";
import { signGithubPayload } from "@/lib/repo-webhooks/signature";

const KEY_MATERIAL = "route-test-only-secret-key-material-0123456789abcdef";
process.env.BETTER_AUTH_SECRET = KEY_MATERIAL;

const mocks = vi.hoisted(() => ({
  findWebhookConnection: vi.fn(),
  countRecentDeliveries: vi.fn(),
  recordWebhookError: vi.fn(),
  recordWebhookEvent: vi.fn(),
  ingestWebhookReferences: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/repo-webhooks", () => mocks);

import { POST as githubPost } from "@/app/api/webhooks/github/[connectionId]/route";
import { POST as gitlabPost } from "@/app/api/webhooks/gitlab/[connectionId]/route";

const CONNECTION_ID = "0b6c2a5e-3f1d-4c8e-9a7b-1d2e3f4a5b6c";
const UNKNOWN_ID = "11111111-2222-4333-8444-555555555555";
const SECRET = "the-webhook-secret";

function connection(provider: "github" | "gitlab", repositoryPath: string) {
  return {
    id: CONNECTION_ID,
    backlogId: "backlog-1",
    backlogKey: "CASS",
    provider,
    instanceUrl: provider === "github" ? "https://github.com" : "https://gitlab.example.invalid",
    repositoryPath,
    secretCiphertext: sealSecret(SECRET, secretBoxKey(KEY_MATERIAL)),
  };
}

function githubRequest(
  payload: unknown,
  { event = "pull_request", secret = SECRET, id = CONNECTION_ID, delivery = "delivery-1", body }: {
    event?: string; secret?: string; id?: string; delivery?: string; body?: string;
  } = {},
) {
  const raw = body ?? JSON.stringify(payload);
  const request = new Request(`http://localhost/api/webhooks/github/${id}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-github-delivery": delivery,
      "x-hub-signature-256": signGithubPayload(new TextEncoder().encode(raw), secret),
    },
    body: raw,
  });
  return githubPost(request, { params: Promise.resolve({ connectionId: id }) });
}

function gitlabRequest(payload: unknown, { token = SECRET, event = "Merge Request Hook" } = {}) {
  const request = new Request(`http://localhost/api/webhooks/gitlab/${CONNECTION_ID}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-gitlab-event": event,
      "x-gitlab-event-uuid": "event-uuid-1",
      "x-gitlab-token": token,
    },
    body: JSON.stringify(payload),
  });
  return gitlabPost(request, { params: Promise.resolve({ connectionId: CONNECTION_ID }) });
}

describe("POST /api/webhooks/{github,gitlab}/[connectionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findWebhookConnection.mockImplementation(async (id: string, provider: "github" | "gitlab") =>
      id === CONNECTION_ID
        ? connection(provider, provider === "github" ? "example-org/example-repo" : "juridiction/greffe/api")
        : null);
    mocks.countRecentDeliveries.mockResolvedValue(0);
    mocks.ingestWebhookReferences.mockResolvedValue({ duplicate: false, linked: 1 });
  });

  it("links a correctly signed GitHub pull request event", async () => {
    const response = await githubRequest(githubPrOpened);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, linked: 1 });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.findWebhookConnection).toHaveBeenCalledWith(CONNECTION_ID, "github");
    expect(mocks.ingestWebhookReferences).toHaveBeenCalledWith({
      connection: expect.objectContaining({ id: CONNECTION_ID }),
      deliveryId: "delivery-1",
      refs: [expect.objectContaining({ kind: "pr", id: "42", state: "open" })],
    });
  });

  it("answers a bad signature, an unknown and a malformed connection identically", async () => {
    const responses = await Promise.all([
      githubRequest(githubPrOpened, { secret: "wrong" }),
      githubRequest(githubPrOpened, { id: UNKNOWN_ID }),
      githubRequest(githubPrOpened, { id: "not-a-uuid" }),
    ]);
    const answers = await Promise.all(responses.map(async (response) => [response.status, await response.text()]));
    expect(answers).toEqual([
      [401, '{"error":"unauthorized"}'],
      [401, '{"error":"unauthorized"}'],
      [401, '{"error":"unauthorized"}'],
    ]);
    expect(mocks.ingestWebhookReferences).not.toHaveBeenCalled();
    // Only the known connection learns about its failing deliveries.
    expect(mocks.recordWebhookError).toHaveBeenCalledTimes(1);
    expect(mocks.recordWebhookError).toHaveBeenCalledWith(CONNECTION_ID, "Signature invalide.");
  });

  it("refuses a delivery whose body was altered after signing", async () => {
    const raw = JSON.stringify(githubPrOpened);
    const request = new Request(`http://localhost/api/webhooks/github/${CONNECTION_ID}`, {
      method: "POST",
      headers: {
        "x-github-event": "pull_request",
        "x-hub-signature-256": signGithubPayload(new TextEncoder().encode(raw), SECRET),
      },
      body: raw.replace("Login form", "Logout form"),
    });
    const response = await githubPost(request, { params: Promise.resolve({ connectionId: CONNECTION_ID }) });
    expect(response.status).toBe(401);
  });

  it("refuses a disabled connection like an unknown one (the lookup hides it)", async () => {
    mocks.findWebhookConnection.mockResolvedValue(null);
    const response = await githubRequest(githubPrOpened);
    expect(response.status).toBe(401);
    expect(mocks.recordWebhookError).not.toHaveBeenCalled();
  });

  it("refuses a payload over 1 MB, declared or streamed, before any lookup", async () => {
    const declared = await githubPost(
      new Request(`http://localhost/api/webhooks/github/${CONNECTION_ID}`, {
        method: "POST",
        headers: { "content-length": String(2 * 1024 * 1024) },
        body: "{}",
      }),
      { params: Promise.resolve({ connectionId: CONNECTION_ID }) },
    );
    expect(declared.status).toBe(413);

    const big = JSON.stringify({ padding: "x".repeat(1024 * 1024) });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    });
    const streamed = await githubPost(
      new Request(`http://localhost/api/webhooks/github/${CONNECTION_ID}`, {
        method: "POST",
        body: stream,
        // @ts-expect-error Node's fetch needs duplex for a streamed body.
        duplex: "half",
      }),
      { params: Promise.resolve({ connectionId: CONNECTION_ID }) },
    );
    expect(streamed.status).toBe(413);
    expect(mocks.findWebhookConnection).not.toHaveBeenCalled();
  });

  it("answers ping with 200 and other events with 202, without linking", async () => {
    const ping = await githubRequest(githubPing, { event: "ping" });
    expect(ping.status).toBe(200);
    const ignored = await githubRequest({ action: "created" }, { event: "star" });
    expect(ignored.status).toBe(202);
    await expect(ignored.json()).resolves.toEqual({ ok: true, ignored: true });
    expect(mocks.recordWebhookEvent).toHaveBeenCalledTimes(2);
    expect(mocks.ingestWebhookReferences).not.toHaveBeenCalled();
  });

  it("acknowledges a replayed delivery without applying it twice", async () => {
    mocks.ingestWebhookReferences.mockResolvedValue({ duplicate: true, linked: 0 });
    const response = await githubRequest(githubPrOpened);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, duplicate: true });
  });

  it("refuses an event from another repository than the connected one", async () => {
    const response = await githubRequest({
      ...githubPrOpened,
      repository: { ...githubPrOpened.repository, full_name: "someone/else" },
    });
    expect(response.status).toBe(422);
    expect(mocks.ingestWebhookReferences).not.toHaveBeenCalled();
    expect(mocks.recordWebhookError).toHaveBeenCalledWith(
      CONNECTION_ID,
      "Dépôt inattendu : someone/else (connecté : example-org/example-repo).",
    );
  });

  it("rejects an authenticated but unreadable or unexpected payload", async () => {
    expect((await githubRequest(null, { body: "not json" })).status).toBe(400);
    expect((await githubRequest({ action: "opened" })).status).toBe(400);
    expect(mocks.ingestWebhookReferences).not.toHaveBeenCalled();
  });

  it("limits the deliveries of a connection", async () => {
    mocks.countRecentDeliveries.mockResolvedValue(120);
    const response = await githubRequest(githubPrOpened);
    expect(response.status).toBe(429);
    expect(mocks.ingestWebhookReferences).not.toHaveBeenCalled();
  });

  it("checks GitLab's secret token and links a merge request", async () => {
    const ok = await gitlabRequest(gitlabMergeRequest);
    expect(ok.status).toBe(200);
    expect(mocks.findWebhookConnection).toHaveBeenCalledWith(CONNECTION_ID, "gitlab");
    expect(mocks.ingestWebhookReferences).toHaveBeenCalledWith(expect.objectContaining({
      deliveryId: "event-uuid-1",
      refs: [expect.objectContaining({ kind: "pr", id: "7" })],
    }));

    const wrong = await gitlabRequest(gitlabMergeRequest, { token: "nope" });
    expect(wrong.status).toBe(401);
    await expect(wrong.text()).resolves.toBe('{"error":"unauthorized"}');
    expect(mocks.recordWebhookError).toHaveBeenCalledWith(CONNECTION_ID, "Jeton secret invalide.");
  });
});
