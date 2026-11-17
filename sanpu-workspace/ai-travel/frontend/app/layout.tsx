import type { Metadata, Viewport } from "next";
import { Providers } from "@sanpu/web";
import "@sanpu/web/styles.css";

export const metadata: Metadata = { title: "Sanpu Trip Copilot", description: "Trip plans that recover from disruption, approved by our team." };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
