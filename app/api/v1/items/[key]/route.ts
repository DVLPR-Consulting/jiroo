import { methodNotAllowed } from "@/lib/api/http";
export { getItem as GET, patchItem as PATCH } from "@/lib/api/routes";
export const runtime = "nodejs";
const allow = "GET, PATCH, HEAD, OPTIONS";
export function OPTIONS() { return new Response(null, { status: 204, headers: { Allow: allow, "Cache-Control": "private, no-store" } }); }
export function POST() { return methodNotAllowed(allow); }
export function PUT() { return methodNotAllowed(allow); }
export function DELETE() { return methodNotAllowed(allow); }
