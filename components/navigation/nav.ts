import { Compass, FileText, Globe2, LayoutDashboard, Map, Network, Sprout } from "lucide-react";

export const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/explorer", label: "Field Explorer", icon: Map },
  { href: "/discoveries", label: "Discovery Center", icon: Compass },
  { href: "/model", label: "Living Field Model", icon: Network },
  { href: "/rotation-lab", label: "Rotation Lab", icon: Sprout },
  { href: "/future-earth", label: "Future Earth", icon: Globe2 },
  { href: "/reports", label: "Reports", icon: FileText },
] as const;
