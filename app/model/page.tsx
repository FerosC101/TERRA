import type { Metadata } from "next";
import { LivingFieldModel } from "@/features/living-field-model/LivingFieldModel";

export const metadata: Metadata = { title: "Living Field Model" };

export default function Page() {
  return <LivingFieldModel />;
}
