import {
  McpStoreError,
  removeServer,
  updateServer,
  type McpServerPatch,
} from "../../../lib/mcp-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const entry = updateServer(id, body as McpServerPatch);
    if (!entry) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ server: entry });
  } catch (err) {
    if (err instanceof McpStoreError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = removeServer(id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
