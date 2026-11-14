import { FIELDS } from "@/data/fields";

export function GET() {
  return Response.json(FIELDS);
}
