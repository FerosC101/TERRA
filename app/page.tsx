import type { Metadata } from "next";
import { Landing } from "@/features/landing/Landing";

/** The public website opens first; the platform starts at /overview. */
export const metadata: Metadata = {
  description: "TERRA combines NASA Earth observation with an in-field sensor station to notice what is changing in a field, explain why, and test crop rotations before planting.",
};

export default function Page() {
  return <Landing />;
}
