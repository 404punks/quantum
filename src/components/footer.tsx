import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 font-mono text-[10px] uppercase tracking-wider text-dim sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-2">
          <span className="font-serif text-sm font-bold tracking-[0.16em] text-up">QUANTUM</span>
          <span>·</span>
          <span>WOTS(w=16, SHA-256) + Merkle(h=8)</span>
        </div>
        <div className="flex gap-4">
          <Link href="/docs" className="cursor-pointer hover:text-fg">Docs</Link>
          <Link href="/prove" className="cursor-pointer hover:text-fg">Verify</Link>
          <a href="https://pump.fun" target="_blank" rel="noreferrer" className="cursor-pointer hover:text-fg">
            Built on pump.fun
          </a>
          <a href="https://github.com/404punks/quantum" target="_blank" rel="noreferrer" className="cursor-pointer hover:text-up">
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
