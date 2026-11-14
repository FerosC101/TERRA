import type { Metadata } from "next";
import { DiscoveryDetail } from "@/features/discovery/DiscoveryDetail";

export const metadata: Metadata = { title: "Discovery" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DiscoveryDetail id={id} />;
}
