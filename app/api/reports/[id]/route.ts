import { FIELDS } from "@/data/fields";
import { mockReport } from "@/services/reportService";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!FIELDS.some((f) => f.id === id)) return Response.json({ error: "Report not found" }, { status: 404 });
  return Response.json(mockReport(id));
}
