// @vitest-environment node
import { describe, expect, it } from "vitest";
import { auth } from "./index";

describe("public registration", () => {
  it("does not expose the email signup endpoint", async () => {
    const response = await auth.handler(
      new Request("http://localhost:3100/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(404);
  });
});

describe("password change endpoint", () => {
  it("is only reachable through the rate-limited Server Action", async () => {
    // auth.api calls still work; the public HTTP route would bypass the
    // account-scoped attempt budget (lib/services/password-change.ts).
    const response = await auth.handler(
      new Request("http://localhost:3100/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3100" },
        body: JSON.stringify({ currentPassword: "x", newPassword: "yyyyyyyy" }),
      }),
    );

    expect(response.status).toBe(404);
  });
});
