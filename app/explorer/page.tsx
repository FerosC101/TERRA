import type { Metadata } from "next";
import { FieldExplorer } from "@/features/field-explorer/FieldExplorer";

export const metadata: Metadata = { title: "Field Explorer" };

export default function Page() {
  return <FieldExplorer />;
}
