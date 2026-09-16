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
