import type { Metadata } from "next";
import { DiscoveryCenter } from "@/features/discovery/DiscoveryCenter";

export const metadata: Metadata = { title: "Discovery Center" };

export default function Page() {
  return <DiscoveryCenter />;
}
