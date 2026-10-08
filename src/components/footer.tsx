import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-[12px] text-dim sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="font-serif font-bold text-muted">pqc.market</span>
          <span>·</span>
          <span className="font-mono">WOTS(w=16, SHA-256) + Merkle(h=8)</span>
        </div>
        <div className="flex gap-4">
          <Link href="/docs" className="cursor-pointer hover:text-fg">Docs</Link>
          <Link href="/prove" className="cursor-pointer hover:text-fg">Verify</Link>
          <a href="https://pump.fun" target="_blank" rel="noreferrer" className="cursor-pointer hover:text-fg">
            Built on pump.fun
          </a>
          <a href="https://x.com/pqcmarket" target="_blank" rel="noreferrer" className="cursor-pointer hover:text-fg">
            Twitter
          </a>
          <a href="https://github.com/pqcmarket" target="_blank" rel="noreferrer" className="cursor-pointer hover:text-fg">
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
