import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  permissionDeniedError,
  resourceNotFoundError,
} from "@/test-utils/action-authorization-errors";
import { DOMAIN_ERROR_MESSAGES, describeDomainError, isDomainError } from "@/lib/use-cases/errors";

describe("describeDomainError", () => {
  it("returns every known service message verbatim", () => {
    for (const message of DOMAIN_ERROR_MESSAGES) {
      expect(describeDomainError(new Error(message))).toBe(message);
    }
    expect(new Set(DOMAIN_ERROR_MESSAGES).size).toBe(DOMAIN_ERROR_MESSAGES.length);
  });

  it("rewords the failures whose text is not meant for the user", () => {
    expect(describeDomainError(new Error("Tous les items doivent appartenir au backlog.")))
      .toBe("Un ou plusieurs items sont introuvables.");
    expect(describeDomainError(new Error('duplicate key value violates unique constraint "items_key_unique"')))
      .toBe("Cette clé est déjà utilisée.");
  });

  it("leaves validation and authorization errors to their own mappers", () => {
    const validation = z.object({ title: z.string().min(1) }).safeParse({ title: "" });
    expect(validation.success).toBe(false);
    if (!validation.success) expect(describeDomainError(validation.error)).toBeNull();
    expect(describeDomainError(permissionDeniedError("edit_items", { type: "global" }))).toBeNull();
    expect(describeDomainError(resourceNotFoundError("item", "item-1"))).toBeNull();
  });

  it("hides unexpected failures", () => {
    expect(describeDomainError(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBeNull();
    expect(describeDomainError(new Error("unique service unavailable"))).toBeNull();
    expect(describeDomainError(new Error("Le backlog de l'item a changé pendant la mutation."))).toBeNull();
    expect(describeDomainError(new TypeError("Cannot read properties of undefined"))).toBeNull();
    expect(describeDomainError("Statut invalide pour ce backlog.")).toBeNull();
    expect(describeDomainError(null)).toBeNull();
    expect(isDomainError(new Error("Statut invalide pour ce backlog."))).toBe(true);
    expect(isDomainError(new Error("boom"))).toBe(false);
  });
});
