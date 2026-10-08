"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/format";

export type TocItem = { id: string; label: string; sub?: boolean };

/** Scroll-spy: the active entry is the last heading that has scrolled past the top offset. */
export function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const offset = 120;
      let current = items[0]?.id;
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top - offset <= 0) current = item.id;
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) current = items[items.length - 1]?.id;
      setActive(current);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items]);

  return (
    <nav className="font-mono text-[12px]">
      <div className="mb-3 flex items-center justify-between text-[10.5px] uppercase tracking-wider text-dim">
        <span>Contents</span>
        <span>{Math.round(progress * 100)}%</span>
      </div>
      <div className="mb-4 h-px bg-line">
        <div className="h-px bg-up transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
      </div>
      <ul className="space-y-0.5 border-l border-line">
        {items.map((item) => {
          const on = item.id === active;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={cn(
                  "-ml-px block cursor-pointer border-l py-1 transition-colors",
                  item.sub ? "pl-6 text-[11.5px]" : "pl-3",
                  on ? "border-up text-fg" : "border-transparent text-dim hover:border-line-strong hover:text-muted",
                )}
              >
                {on && <span className="mr-1.5 text-up">›</span>}
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
