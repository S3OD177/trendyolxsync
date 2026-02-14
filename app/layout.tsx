import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/styles/globals.css";
import { ToasterProvider } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "Trendyol BuyBox Guard",
  description: "Monitor BuyBox status, receive alerts, and apply safe manual price updates."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-cyan-200 selection:text-cyan-950">
        <ToasterProvider>{children}</ToasterProvider>
      </body>
    </html>
  );
}
