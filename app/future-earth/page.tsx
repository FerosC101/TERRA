import type { Metadata } from "next";
import { FutureEarth } from "@/features/future-earth/FutureEarth";

export const metadata: Metadata = { title: "Future Earth" };

export default function Page() {
  return <FutureEarth />;
}
