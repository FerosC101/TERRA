import { FIELDS } from "@/data/fields";
import { mockSimulate, type SimulateRequest } from "@/services/climateScenarioService";

export async function POST(req: Request) {
  const body = (await req.json()) as SimulateRequest;
  if (!FIELDS.some((f) => f.id === body.fieldId) || !Array.isArray(body.plans) || !Array.isArray(body.scenarios)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  return Response.json(mockSimulate(body));
}
