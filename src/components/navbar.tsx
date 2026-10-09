"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Copy, Lock, LogOut, Menu, X } from "lucide-react";
import { cn, short } from "@/lib/format";
import { useIdentity } from "./identity";

const LINKS = [
  { href: "/", label: "Coins" },
  { href: "/launch", label: "Launch" },
  { href: "/identity", label: "Identity" },
  { href: "/wallet", label: "Wallet" },
  { href: "/vault", label: "Vault" },
  { href: "/prove", label: "Verify" },
  { href: "/docs", label: "Docs" },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/coin") : pathname.startsWith(href));

  return (
    <>
      <IdentityBanner />
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex cursor-pointer items-center gap-2.5 transition-opacity hover:opacity-80">
            <Image src="/logo-mark.png" alt="" width={34} height={34} priority />
            <span className="font-serif text-[18px] font-bold tracking-tight">pqc.market</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-1.5 text-[13.5px] transition-colors",
                  isActive(href) ? "text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {label}
              </Link>
            ))}
            <a
              href="https://github.com/pqcmarket"
              target="_blank"
              rel="noreferrer"
              className="cursor-pointer rounded-md px-3 py-1.5 text-[13.5px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              GitHub
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <WalletMenu />
            <button
              onClick={() => setOpen((v) => !v)}
              className="cursor-pointer rounded-md border border-line p-2 text-muted transition-colors hover:border-line-strong hover:text-fg md:hidden"
              aria-label="Menu"
            >
              {open ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>

        {open && (
          <nav className="border-t border-line px-4 py-2 md:hidden">
            {LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "block cursor-pointer rounded-md px-2 py-2.5 text-sm hover:bg-surface-2 hover:text-fg",
                  isActive(href) ? "text-fg" : "text-muted",
                )}
              >
                {label}
              </Link>
            ))}
            <a
              href="https://github.com/pqcmarket"
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="block cursor-pointer rounded-md px-2 py-2.5 text-sm text-muted hover:bg-surface-2 hover:text-fg"
            >
              GitHub
            </a>
          </nav>
        )}
      </header>
    </>
  );
}

function WalletMenu() {
  const { connected, wallet, connect, disconnect, remote, unlocked, lock } = useIdentity();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!connected || !wallet) {
    return (
      <button
        onClick={connect}
        className="cursor-pointer rounded-md bg-white px-4 py-2 text-[13px] font-semibold text-black transition-colors hover:bg-neutral-200"
      >
        Connect Wallet
      </button>
    );
  }

  const status = unlocked ? "unlocked" : remote ? "locked" : "none";
  const pqAddress = remote?.pq_address ?? unlocked?.pqAddress;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-md border bg-surface px-3 py-2 font-mono text-[12.5px] text-fg transition-colors hover:border-line-strong hover:bg-surface-2",
          open ? "border-line-strong" : "border-line",
        )}
      >
        <Image
          src="/logo-mark.png"
          alt=""
          width={18}
          height={18}
          title={status === "unlocked" ? "PQ keys unlocked" : status === "locked" ? "PQ identity locked" : "No PQ identity"}
        />
        {short(wallet)}
        <ChevronDown size={13} className={cn("text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="fade-up absolute right-0 top-[calc(100%+6px)] z-50 w-72 overflow-hidden rounded-md border border-line-strong bg-surface shadow-2xl shadow-black/60">
          <div className="border-b border-line px-4 py-3">
            <div className="text-[11px] text-dim">Wallet</div>
            <div className="mt-0.5 font-mono text-[12.5px] text-fg">{short(wallet, 8, 8)}</div>
            <div className="mt-3 text-[11px] text-dim">PQ identity</div>
            <div className="mt-0.5 flex items-center justify-between gap-2 font-mono text-[12px]">
              <span className={pqAddress ? "text-fg" : "text-warn"}>{pqAddress ? short(pqAddress, 8, 6) : "not set up"}</span>
              <span className={cn("text-[11px]", status === "unlocked" ? "text-up" : "text-dim")}>
                {status === "unlocked" ? "unlocked" : status === "locked" ? "locked" : ""}
              </span>
            </div>
          </div>

          <div className="py-1 text-[13px]">
            <MenuLink href="/identity" onClick={() => setOpen(false)}>
              {remote ? "Identity & keys" : "Set up PQ identity"}
            </MenuLink>
            <MenuLink href="/vault" onClick={() => setOpen(false)}>Quantum vault</MenuLink>
            <MenuLink href="/prove" onClick={() => setOpen(false)}>Prove & verify</MenuLink>
            <MenuLink href="/launch" onClick={() => setOpen(false)}>Launch a coin</MenuLink>
          </div>

          <div className="border-t border-line py-1 text-[13px]">
            <MenuButton
              onClick={() => {
                void navigator.clipboard?.writeText(wallet);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              <Copy size={13} /> {copied ? "Copied" : "Copy address"}
            </MenuButton>
            <a
              href={`https://solscan.io/account/${wallet}`}
              target="_blank"
              rel="noreferrer"
              className="flex cursor-pointer items-center gap-2.5 px-4 py-2 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <ArrowUpRight size={13} /> View on Solscan
            </a>
            {unlocked && (
              <MenuButton onClick={() => { lock(); setOpen(false); }}>
                <Lock size={13} /> Lock PQ keys
              </MenuButton>
            )}
            <MenuButton
              danger
              onClick={() => {
                setOpen(false);
                disconnect();
              }}
            >
              <LogOut size={13} /> Disconnect
            </MenuButton>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link href={href} onClick={onClick} className="block cursor-pointer px-4 py-2 text-muted transition-colors hover:bg-surface-2 hover:text-fg">
      {children}
    </Link>
  );
}

function MenuButton({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-surface-2",
        danger ? "text-down/90 hover:text-down" : "text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

/** Shown on every page to connected wallets until they register a PQ identity. ✕ hides it for the current page only. */
function IdentityBanner() {
  const { connected, remote, remoteLoading } = useIdentity();
  const pathname = usePathname();
  const [dismissedOn, setDismissedOn] = useState<string | null>(null);

  if (!connected || remoteLoading || remote || dismissedOn === pathname) return null;
  const onIdentityPage = pathname.startsWith("/identity");

  return (
    <div className="relative border-b border-warn/15 bg-warn/[0.07]">
      <div className="mx-auto flex h-7 max-w-6xl items-center justify-center gap-2 px-10 text-[11.5px]">
        <span className="truncate text-muted">No post-quantum identity on this wallet yet.</span>
        {onIdentityPage ? (
          <span className="shrink-0 font-medium text-warn">Set it up below ↓</span>
        ) : (
          <Link href="/identity" className="shrink-0 cursor-pointer font-medium text-warn underline-offset-2 hover:underline">
            Set up →
          </Link>
        )}
        <button
          onClick={() => setDismissedOn(pathname)}
          className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer p-0.5 text-dim transition-colors hover:text-fg"
          aria-label="Dismiss"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
