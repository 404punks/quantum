import type { Metadata } from "next";
import { BrandView } from "@/components/brand/brand-view";
import { FONT_FILES } from "@/components/brand/fonts";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const FONT_FACES = FONT_FILES.map(
  (f) =>
    `@font-face { font-family: "${f.family}"; src: url(${f.url}) format("woff2"); font-weight: ${f.weight}; font-style: ${f.style}; font-display: block; }`,
).join("\n");

export default function Page() {
  return (
    <>
      <style>{FONT_FACES}</style>
      <BrandView />
    </>
  );
}
