import {
  addServer,
  listServers,
  McpStoreError,
  type McpServerInput,
} from "../../lib/mcp-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ servers: listServers() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const entry = addServer(body as McpServerInput);
    return Response.json({ server: entry }, { status: 201 });
  } catch (err) {
    if (err instanceof McpStoreError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
