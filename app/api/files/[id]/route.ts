import { fileStore } from "../../../lib/file-store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const f = fileStore.get(id);
  if (!f) return new Response("Not found", { status: 404 });
  const safeName = f.filename.replace(/"/g, "");
  return new Response(f.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-store",
    },
  });
}
