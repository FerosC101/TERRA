import type { Metadata } from "next";
import { Inter, Orbitron } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import { AppShell } from "@/components/navigation/AppShell";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const orbitron = Orbitron({ variable: "--font-orbitron", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "TERRA", template: "%s · TERRA" },
  description:
    "TERRA — agricultural discovery and crop-rotation intelligence. Discover. Predict. Regenerate.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${orbitron.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
