import type { Metadata } from "next";
import { Suspense } from "react";
import { Chakra_Petch, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import "./globals.css";

const sans = Space_Grotesk({ variable: "--font-quantum-sans", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-quantum-mono", subsets: ["latin"] });
const display = Chakra_Petch({ variable: "--font-quantum-display", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: {
    default: "quantum",
    template: "%s · quantum",
  },
  description:
    "The post-quantum launch terminal. Launch coins with hash-based attestations, Merkle identities, and quantum vaults.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>
          {/* Cache Components: request-time reads (pathname, params) must sit under Suspense. */}
          <Suspense fallback={<div className="h-16 border-b border-line" />}>
            <Navbar />
          </Suspense>
          <main className="flex-1">
            <Suspense>{children}</Suspense>
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
