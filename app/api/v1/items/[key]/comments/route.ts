import { methodNotAllowed } from "@/lib/api/http";
export { postComment as POST } from "@/lib/api/routes";
export const runtime = "nodejs";
const allow = "POST, OPTIONS";
export function OPTIONS() { return new Response(null, { status: 204, headers: { Allow: allow, "Cache-Control": "private, no-store" } }); }
export function GET() { return methodNotAllowed(allow); }
export function PUT() { return methodNotAllowed(allow); }
export function PATCH() { return methodNotAllowed(allow); }
export function DELETE() { return methodNotAllowed(allow); }
export function HEAD() { return methodNotAllowed(allow); }
