import type { Metadata } from "next";
import { Space_Grotesk, Sora } from "next/font/google";
import type { ReactNode } from "react";
import "@/styles/globals.css";
import { ToasterProvider } from "@/components/ui/toaster";
import { ChunkErrorRecovery } from "@/components/runtime/chunk-error-recovery";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });

export const metadata: Metadata = {
  title: "Trendyol BuyBox Guard",
  description: "Monitor BuyBox status, receive alerts, and apply safe manual price updates."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${spaceGrotesk.variable} ${sora.variable} min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 selection:text-foreground`}
      >
        <ChunkErrorRecovery />
        <ToasterProvider>{children}</ToasterProvider>
      </body>
    </html>
  );
}
