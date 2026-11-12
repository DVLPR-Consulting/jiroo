import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  currentActivitySource,
  currentActorContext,
  runWithActor,
  type Actor,
} from "@/lib/auth/actor-context";

const writer: Actor = { actorId: "writer-1", source: "api", tokenId: "token-1" };

describe("actor context", () => {
  it("has no actor and defaults to the interface outside a scope", () => {
    expect(currentActorContext()).toBeNull();
    expect(currentActivitySource()).toBe("ui");
  });

  it("exposes the actor to the work it wraps, including awaited reads", async () => {
    const seen = await runWithActor(writer, async () => {
      await Promise.resolve();
      return { actor: currentActorContext(), source: currentActivitySource() };
    });

    expect(seen).toEqual({ actor: writer, source: "api" });
    expect(currentActorContext()).toBeNull();
  });

  it("keeps concurrent scopes apart", async () => {
    const other: Actor = { actorId: "agent-1", source: "mcp" };
    const [first, second] = await Promise.all([
      runWithActor(writer, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return currentActorContext()?.actorId;
      }),
      runWithActor(other, async () => currentActorContext()?.actorId),
    ]);

    expect(first).toBe("writer-1");
    expect(second).toBe("agent-1");
  });

  it("lets an inner scope override the outer one for its own work only", async () => {
    const inner: Actor = { actorId: "inner", source: "webhook" };
    await runWithActor(writer, async () => {
      const nested = await runWithActor(inner, async () => currentActivitySource());
      expect(nested).toBe("webhook");
      expect(currentActivitySource()).toBe("api");
    });
  });

  it("propagates the rejection of the wrapped work", async () => {
    await expect(runWithActor(writer, async () => {
      throw new Error("boom");
    })).rejects.toThrow("boom");
  });
});
