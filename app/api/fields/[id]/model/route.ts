import { FIELDS } from "@/data/fields";
import { mockFieldModel } from "@/services/discoveryService";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const field = FIELDS.find((f) => f.id === id);
  if (!field) return Response.json({ error: "Field not found" }, { status: 404 });
  return Response.json(mockFieldModel(field.id));
}
