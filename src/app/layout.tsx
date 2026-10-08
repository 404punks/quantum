import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Libre_Baskerville } from "next/font/google";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const serif = Libre_Baskerville({ variable: "--font-serif", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "pqc.market",
  description:
    "Launch coins on pump.fun with hash-based, post-quantum attestations. WOTS one-time keys, Merkle identities, on-chain anchors.",
  metadataBase: new URL("https://pqc.market"),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} h-full antialiased`}>
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
