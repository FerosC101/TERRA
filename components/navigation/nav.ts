import { Compass, FileText, FlaskConical, Globe2, LayoutDashboard, Map, Network } from "lucide-react";

export const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, step: "Observe" },
  { href: "/explorer", label: "Field Explorer", icon: Map, step: "Observe" },
  { href: "/discoveries", label: "Discovery Center", icon: Compass, step: "Discover" },
  { href: "/model", label: "Living Field Model", icon: Network, step: "Understand" },
  { href: "/rotation-lab", label: "Rotation Lab", icon: FlaskConical, step: "Experiment" },
  { href: "/future-earth", label: "Future Earth", icon: Globe2, step: "Adapt" },
  { href: "/reports", label: "Reports", icon: FileText, step: "Report" },
] as const;
