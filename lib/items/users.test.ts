import { describe, expect, it } from "vitest";
import {
  changeOwnPasswordInput,
  createUserInput,
  resetUserPasswordInput,
  resetUserTwoFactorInput,
  setRoleInput,
  ROLE_LABELS,
} from "./users";

// ---------------------------------------------------------------------------
// createUserInput
// ---------------------------------------------------------------------------

describe("createUserInput", () => {
  const valid = {
    email: "jean.dupont@example.com",
    name: "Jean Dupont",
    role: "contributor",
    password: "motdepasse123",
  };

  it("accepts a valid input", () => {
    expect(createUserInput.safeParse(valid).success).toBe(true);
  });

  // email
  it("rejects a missing email", () => {
    expect(createUserInput.safeParse({ ...valid, email: undefined }).success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(createUserInput.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects an empty email", () => {
    expect(createUserInput.safeParse({ ...valid, email: "" }).success).toBe(false);
  });

  it("trims whitespace from the email before validation", () => {
    const result = createUserInput.safeParse({ ...valid, email: "  user@test.com  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("user@test.com");
  });

  it("normalizes the email to lowercase after trimming", () => {
    const result = createUserInput.parse({ ...valid, email: " ADMIN@EXAMPLE.COM " });
    expect(result.email).toBe("admin@example.com");
  });

  // name
  it("rejects an empty name", () => {
    expect(createUserInput.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only name (after trim)", () => {
    expect(createUserInput.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });

  it("accepts a name of exactly 1 char", () => {
    expect(createUserInput.safeParse({ ...valid, name: "A" }).success).toBe(true);
  });

  it("accepts a name of exactly 80 chars", () => {
    expect(createUserInput.safeParse({ ...valid, name: "a".repeat(80) }).success).toBe(true);
  });

  it("rejects a name longer than 80 chars", () => {
    expect(createUserInput.safeParse({ ...valid, name: "a".repeat(81) }).success).toBe(false);
  });

  it("trims whitespace from the name", () => {
    const result = createUserInput.safeParse({ ...valid, name: "  Jean  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Jean");
  });

  // role
  it("accepts 'admin' role", () => {
    expect(createUserInput.safeParse({ ...valid, role: "admin" }).success).toBe(true);
  });

  it("accepts 'contributor' role", () => {
    expect(createUserInput.safeParse({ ...valid, role: "contributor" }).success).toBe(true);
  });

  it("accepts 'viewer' role", () => {
    expect(createUserInput.safeParse({ ...valid, role: "viewer" }).success).toBe(true);
  });

  it("rejects an unknown role", () => {
    const result = createUserInput.safeParse({ ...valid, role: "superuser" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Rôle invalide.");
  });

  it("rejects a missing role", () => {
    expect(createUserInput.safeParse({ ...valid, role: undefined }).success).toBe(false);
  });

  // password
  it("accepts a password of exactly 8 chars", () => {
    expect(createUserInput.safeParse({ ...valid, password: "12345678" }).success).toBe(true);
  });

  it("rejects a password shorter than 8 chars", () => {
    const result = createUserInput.safeParse({ ...valid, password: "short" });
    expect(result.success).toBe(false);
  });

  it("carries the French password error message", () => {
    const result = createUserInput.safeParse({ ...valid, password: "1234567" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === "Mot de passe : 8 caractères minimum.")).toBe(true);
    }
  });

  it("rejects a missing password", () => {
    expect(createUserInput.safeParse({ ...valid, password: undefined }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setRoleInput
// ---------------------------------------------------------------------------

describe("setRoleInput", () => {
  it("accepts a valid userId + role", () => {
    expect(setRoleInput.safeParse({ userId: "abc-123", role: "admin" }).success).toBe(true);
  });

  it("rejects an unknown role", () => {
    const result = setRoleInput.safeParse({ userId: "abc-123", role: "god" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Rôle invalide.");
  });

  it("rejects a missing userId", () => {
    expect(setRoleInput.safeParse({ role: "admin" }).success).toBe(false);
  });

  it("rejects an empty userId", () => {
    expect(setRoleInput.safeParse({ userId: "", role: "viewer" }).success).toBe(false);
  });

  it("rejects a missing role", () => {
    expect(setRoleInput.safeParse({ userId: "abc-123" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ROLE_LABELS
// ---------------------------------------------------------------------------

describe("ROLE_LABELS", () => {
  it("maps admin to Administrateur Jiroo", () => {
    expect(ROLE_LABELS.admin).toBe("Administrateur Jiroo");
  });

  it("maps contributor to Contributeur", () => {
    expect(ROLE_LABELS.contributor).toBe("Contributeur");
  });

  it("maps viewer to Lecteur", () => {
    expect(ROLE_LABELS.viewer).toBe("Lecteur");
  });
});

// ---------------------------------------------------------------------------
// Account recovery inputs (JIR-61)
// ---------------------------------------------------------------------------

describe("resetUserPasswordInput", () => {
  it("accepts a temporary password of at least 8 characters", () => {
    expect(
      resetUserPasswordInput.parse({ userId: "user-1", temporaryPassword: "temp-pass" }),
    ).toEqual({ userId: "user-1", temporaryPassword: "temp-pass" });
  });

  it("applies the same 8-character minimum as user creation", () => {
    const result = resetUserPasswordInput.safeParse({ userId: "user-1", temporaryPassword: "short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Mot de passe : 8 caractères minimum.");
    }
  });

  it("rejects passwords longer than Better Auth accepts", () => {
    const result = resetUserPasswordInput.safeParse({
      userId: "user-1",
      temporaryPassword: "x".repeat(129),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Mot de passe : 128 caractères maximum.");
    }
  });

  it("requires the target user", () => {
    const result = resetUserPasswordInput.safeParse({ userId: "", temporaryPassword: "temp-pass" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("L’utilisateur est requis.");
  });
});

describe("resetUserTwoFactorInput", () => {
  it("requires the target user", () => {
    expect(resetUserTwoFactorInput.safeParse({ userId: "user-1" }).success).toBe(true);
    expect(resetUserTwoFactorInput.safeParse({ userId: "" }).success).toBe(false);
  });
});

describe("changeOwnPasswordInput", () => {
  const valid = {
    currentPassword: "ancien-mot",
    newPassword: "nouveau-mot",
    confirmation: "nouveau-mot",
  };

  it("accepts a matching new password", () => {
    expect(changeOwnPasswordInput.parse(valid)).toEqual(valid);
  });

  it("requires the current password", () => {
    const result = changeOwnPasswordInput.safeParse({ ...valid, currentPassword: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Le mot de passe actuel est requis.");
    }
  });

  it("rejects a new password shorter than 8 characters", () => {
    const result = changeOwnPasswordInput.safeParse({
      ...valid,
      newPassword: "court",
      confirmation: "court",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Mot de passe : 8 caractères minimum.");
    }
  });

  it("rejects a confirmation that does not match", () => {
    const result = changeOwnPasswordInput.safeParse({ ...valid, confirmation: "autre-mot" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Les mots de passe ne correspondent pas.");
    }
  });

  it("rejects reusing the current password", () => {
    const result = changeOwnPasswordInput.safeParse({
      currentPassword: "meme-mot-1",
      newPassword: "meme-mot-1",
      confirmation: "meme-mot-1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Le nouveau mot de passe doit être différent de l’actuel.",
      );
    }
  });
});
