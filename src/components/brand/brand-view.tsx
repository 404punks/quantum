"use client";

import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Download, Loader2 } from "lucide-react";
import { GRAPHICS, type Graphic } from "./graphics";
import { FONT_FILES, SERIF } from "./fonts";
import { Button } from "../ui";

// Fonts are embedded as data URIs built here: html-to-image cannot reliably discover
// Next's self-hosted font files. Built once, reused for every export.
let fontCss: Promise<string> | null = null;

async function dataUrl(url: string) {
  const blob = await fetch(url).then((r) => r.blob());
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function buildFontCss() {
  const faces = await Promise.all(
    FONT_FILES.map(async (f) => `@font-face { font-family: "${f.family}"; src: url(${await dataUrl(f.url)}) format("woff2"); font-weight: ${f.weight}; font-style: ${f.style}; }`),
  );
  return faces.join("\n");
}

async function loadBrandFonts() {
  await Promise.all(FONT_FILES.map((f) => document.fonts.load(`${f.style} ${f.weight} 40px "${f.family}"`)));
}

async function exportPng(node: HTMLElement, g: Graphic) {
  fontCss ??= buildFontCss();
  const url = await toPng(node, {
    width: g.w,
    height: g.h,
    pixelRatio: 1,
    cacheBust: true,
    fontEmbedCSS: await fontCss,
  });
  const a = document.createElement("a");
  a.href = url;
  a.download = `pqc-market-${g.id}-${g.w}x${g.h}.png`;
  a.click();
}

export function BrandView() {
  const nodes = useRef(new Map<string, HTMLElement>());
  const [busy, setBusy] = useState<string | null>(null);
  const groups = [...new Set(GRAPHICS.map((g) => g.group))];

  async function download(g: Graphic) {
    const node = nodes.current.get(g.id);
    if (!node) return;
    setBusy(g.id);
    try {
      await loadBrandFonts();
      await exportPng(node, g);
    } finally {
      setBusy(null);
    }
  }

  async function downloadAll() {
    setBusy("all");
    try {
      await loadBrandFonts();
      for (const g of GRAPHICS) {
        const node = nodes.current.get(g.id);
        if (node) await exportPng(node, g);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-[11.5px] text-dim">/brand</div>
          <h1 className="mt-2 text-[44px] leading-none text-fg" style={{ fontFamily: SERIF, fontWeight: 700 }}>
            Brand kit
          </h1>
          <p className="mt-3 max-w-xl text-[14px] text-muted">
            Ready-to-post graphics, exported at exact size. Proof and fingerprint graphics are rendered from real WOTS computations.
          </p>
        </div>
        <Button variant="primary" onClick={() => void downloadAll()} disabled={busy !== null}>
          {busy === "all" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Download all ({GRAPHICS.length})
        </Button>
      </div>

      {groups.map((group) => (
        <section key={group} className="mt-14">
          <h2 className="mb-5 font-mono text-[12px] uppercase tracking-wider text-dim">{group}</h2>
          <div className="grid gap-8 md:grid-cols-2">
            {GRAPHICS.filter((g) => g.group === group).map((g) => (
              <figure key={g.id} className={g.w === 400 ? "max-w-sm" : undefined}>
                <Preview g={g} register={(el) => {
                  if (el) nodes.current.set(g.id, el);
                  else nodes.current.delete(g.id);
                }} />
                <figcaption className="mt-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-medium">{g.title}</div>
                    <div className="font-mono text-[11.5px] text-dim">
                      {g.w} × {g.h} · {g.note}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => void download(g)} disabled={busy !== null}>
                    {busy === g.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    PNG
                  </Button>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Renders the graphic at native size and scales the wrapper to fit; export reads the unscaled node. */
function Preview({ g, register }: { g: Graphic; register: (el: HTMLElement | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / g.w));
    ro.observe(el);
    return () => ro.disconnect();
  }, [g.w]);

  const { Component } = g;
  return (
    <div ref={box} className="relative w-full overflow-hidden border border-line-strong" style={{ height: scale ? g.h * scale : undefined, aspectRatio: scale ? undefined : `${g.w} / ${g.h}` }}>
      <div style={{ width: g.w, height: g.h, transform: `scale(${scale})`, transformOrigin: "top left", visibility: scale ? "visible" : "hidden" }}>
        <div ref={register}>
          <Component />
        </div>
      </div>
    </div>
  );
}
