import { FIELDS } from "@/data/fields";
import { NASA_SNAPSHOTS } from "@/data/nasa";

/** The real NASA record bundled for a field, or null when the pipeline has not been run for it. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!FIELDS.some((f) => f.id === id)) return Response.json({ error: "Field not found" }, { status: 404 });
  return Response.json(NASA_SNAPSHOTS[id] ?? null);
}
