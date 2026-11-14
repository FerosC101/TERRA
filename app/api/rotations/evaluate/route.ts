import { FIELDS } from "@/data/fields";
import { mockEvaluate } from "@/services/rotationService";
import type { EvaluateRequest } from "@/types";

export async function POST(req: Request) {
  const body = (await req.json()) as EvaluateRequest;
  if (!FIELDS.some((f) => f.id === body.fieldId) || !Array.isArray(body.plans)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  return Response.json(mockEvaluate(body));
}
