import type { Metadata } from "next";
import { RotationLab } from "@/features/rotation-lab/RotationLab";

export const metadata: Metadata = { title: "Rotation Lab" };

export default function Page() {
  return <RotationLab />;
}
