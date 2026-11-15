import { FIELDS } from "@/data/fields";
import { realRecord } from "@/data/nasa/realRecords";
import { realSeriesRows } from "@/lib/adapters/realSeries";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!FIELDS.some((f) => f.id === id)) return Response.json({ error: "Field not found" }, { status: 404 });
  const days = realRecord(id);
  return Response.json(days ? realSeriesRows(days) : null);
}
