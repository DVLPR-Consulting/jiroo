import { describe, expect, it } from "vitest";
import { z } from "zod";
import { jsonOk, mapErrorToProblem, problem } from "./http";

describe("REST responses", () => {
  it("returns private JSON and preserves the status", async () => {
    const response = jsonOk({ item: { id: "i" } }, 201);
    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ item: { id: "i" } });
  });
  it("returns Zod issues without input values", async () => {
    const result = z.object({ title: z.string().min(1) }).safeParse({ title: "" });
    const response = mapErrorToProblem(result.error);
    expect(response.status).toBe(400);
    const body = await response.clone().json();
    expect(body.errors[0].message).toMatch(/Trop petit/);
    expect(await response.json()).toMatchObject({ type: "https://jiroo.dev/problems/validation_error", errors: [{ path: ["title"] }] });
  });
  it.each([new Error("postgres://private-password"), { message: "secret" }, null])("hides unexpected failures %s", async (error) => {
    const response = mapErrorToProblem(error);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ type: "https://jiroo.dev/problems/internal_error", title: "Une erreur interne est survenue.", status: 500 });
  });
  it("describes only known business rules", async () => {
    const response = mapErrorToProblem(new Error("Hiérarchie invalide pour ce type."));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ detail: "Hiérarchie invalide pour ce type." });
  });
  it.each([["ResourceNotFoundError", 404], ["PermissionDeniedError", 403], ["InvalidCursorError", 400]])("maps %s", (name, status) => {
    expect(mapErrorToProblem(Object.assign(new Error("private"), { name })).status).toBe(status);
  });
  it("sets problem media type and supplied headers", () => {
    const response = problem("rate_limited", { headers: { "Retry-After": "12" } });
    expect(response.status).toBe(429);
    expect(response.headers.get("content-type")).toBe("application/problem+json; charset=utf-8");
    expect(response.headers.get("retry-after")).toBe("12");
  });
});
