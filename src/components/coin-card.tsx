"use client";

import Link from "next/link";
import type { LaunchItem, MarketItem } from "@/lib/types";
import { ago, cn, coinPath, num, pct, usd, thumb } from "@/lib/format";
import { SCHEMES, type SchemeId } from "@/lib/pq/scheme-info";
import { Lock } from "lucide-react";
import { DigestGrid } from "./digest-grid";
import { Skeleton } from "./ui";

type CardLaunch = Pick<LaunchItem, "mint" | "name" | "symbol" | "image_url" | "leaf_index"> &
  Partial<Pick<LaunchItem, "launched_at" | "message_hash" | "scheme" | "dev_vault" | "quote_symbol" | "quote_image">> & { digest?: Uint8Array };

export function CoinCard({
  launch,
  market,
  marketLoading,
  preview,
  fresh,
}: {
  launch: CardLaunch;
  market?: MarketItem;
  marketLoading?: boolean;
  preview?: boolean;
  fresh?: boolean;
}) {
  const change = market?.change24h ?? null;
  const up = (change ?? 0) >= 0;
  const progress = market?.curve?.progress ?? 0;
  const graduated = market?.curve?.complete;
  const quantum = Boolean(launch.dev_vault);

  const body = (
    <>
      {quantum && <QuantumFrame />}
      <header className="flex items-start gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden border border-line bg-surface-2">
          {launch.image_url ? (
            <img src={thumb(launch.image_url, 112)} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-serif text-lg text-dim">{launch.symbol?.[0] ?? "?"}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-fg group-hover:underline">{launch.name || "Untitled"}</h3>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-[12px] text-muted">
            <span className="truncate">${launch.symbol || "TICKER"}</span>
            {launch.quote_symbol && (
              <span className="flex shrink-0 items-center gap-1 text-dim" title={`Paired with ${launch.quote_symbol}`}>
                /
                {launch.quote_image && <img src={launch.quote_image} alt="" className="h-3.5 w-3.5 rounded-full" loading="lazy" />}
                <span className="text-muted">{launch.quote_symbol}</span>
              </span>
            )}
          </div>
          <div className="mt-1.5 truncate font-mono text-[11px] text-dim">
            {schemeLabel(launch.scheme, launch.leaf_index)}
            {launch.launched_at && <> · {ago(launch.launched_at)}</>}
          </div>
        </div>
        <div className={cn("font-mono text-[13px]", change == null ? "text-dim" : up ? "text-up" : "text-down")}>
          {marketLoading ? <Skeleton className="h-4 w-14" /> : pct(change)}
        </div>
      </header>

      <div
        className={cn("relative mt-4 overflow-hidden border bg-bg px-2.5 pb-2.5 pt-2", quantum ? "border-line-strong" : "border-line")}
        style={quantum ? { backgroundImage: HATCH } : undefined}
      >
        {quantum && (
          <span aria-hidden className="q-scan pointer-events-none absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-transparent via-white/[0.09] to-transparent" />
        )}
        <div className="mb-1.5 flex justify-between font-mono text-[10px] text-dim">
          <span>{quantum ? "hash-based attestation" : "attestation digest"}</span>
          {quantum ? (
            <span
              className="flex items-center gap-1 text-muted"
              title={launch.dev_vault && launch.dev_vault.length > 20 ? `Dev funds in quantum vault ${launch.dev_vault}` : "Dev funds go to your quantum vault"}
            >
              <Lock size={9} className="text-fg" /> dev funds vault-locked
            </span>
          ) : (
            <span>{launch.scheme && launch.scheme !== "wots" ? SCHEMES[launch.scheme as SchemeId]?.aka : `leaf #${launch.leaf_index}`}</span>
          )}
        </div>
        <DigestGrid digest={launch.digest ?? launch.message_hash} cellClass="h-3.5" />
      </div>

      <div className="mt-auto">
      <dl className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Market cap" value={usd(market?.marketCap)} loading={marketLoading} />
        <Stat label="Volume 24h" value={usd(market?.volume24h)} loading={marketLoading} />
        <Stat label="Holders" value={num(market?.holders)} loading={marketLoading} />
      </dl>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11.5px]">
          <span className="text-muted">{graduated ? "Graduated" : "Bonding curve"}</span>
          <span className="font-mono text-muted">{marketLoading ? "…" : `${(progress * 100).toFixed(1)}%`}</span>
        </div>
        <div className="h-1 overflow-hidden bg-surface-3">
          <div
            className={cn("h-full transition-[width] duration-700", graduated ? "bg-up" : "bg-fg")}
            style={{
              width: `${Math.max(progress * 100, 1)}%`,
              ...(quantum && !graduated ? { backgroundImage: "repeating-linear-gradient(90deg, transparent 0 3px, rgba(0,0,0,0.55) 3px 4px)" } : {}),
            }}
          />
        </div>
      </div>
      </div>
    </>
  );

  const className = cn(
    "pixel-panel fade-up group relative flex flex-col border bg-surface/80 p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-1",
    fresh ? "border-up/70 shadow-[0_0_0_1px_var(--up),0_0_28px_-8px_var(--up)]" : quantum ? "border-up/35 shadow-[0_0_24px_-18px_var(--up)]" : "border-line",
  );
  const style = quantum ? { backgroundImage: DOTS, backgroundSize: "12px 12px" } : undefined;
  const card = preview ? (
    <article className={className} style={style}>{body}</article>
  ) : (
    <Link href={coinPath(launch.mint, quantum)} style={style} className={cn(className, "cursor-pointer hover:border-line-strong hover:bg-surface-2")}>
      {body}
    </Link>
  );
  return (
    <div className="relative min-w-0">
      {quantum && (
        <span className="absolute -top-2 right-4 z-10 flex items-center gap-1.5 bg-fg px-1.5 font-mono text-[9.5px] font-semibold leading-4 tracking-[0.14em] text-bg">
          <span className="q-blink inline-block h-2 w-1 bg-bg" />
          QUANTUM
        </span>
      )}
      {fresh && (
        <span className="absolute -top-2.5 left-4 z-10 border border-up/60 bg-bg px-1.5 font-mono text-[10px] text-up">just launched</span>
      )}
      {card}
    </div>
  );
}

/** Faint dot grid across a quantum card. */
const DOTS = "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)";

/** Faint 45° hatch behind a quantum coin's attestation. */
const HATCH = "repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 7px)";

/** Viewfinder corners: the card reads as sealed, not glowing. They grow on hover. */
function QuantumFrame() {
  const corner = "pointer-events-none absolute z-10 h-3 w-3 border-fg transition-all duration-300 group-hover:h-5 group-hover:w-5";
  return (
    <>
      <span aria-hidden className={cn(corner, "-left-px -top-px border-l-2 border-t-2")} />
      <span aria-hidden className={cn(corner, "-right-px -top-px border-r-2 border-t-2")} />
      <span aria-hidden className={cn(corner, "-bottom-px -left-px border-b-2 border-l-2")} />
      <span aria-hidden className={cn(corner, "-bottom-px -right-px border-b-2 border-r-2")} />
    </>
  );
}

function Stat({ label, value, loading }: { label: string; value: string; loading?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-dim">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-[13px] text-fg">{loading ? <Skeleton className="mt-1 h-3.5 w-14" /> : value}</dd>
    </div>
  );
}

function schemeLabel(scheme: string | undefined, leaf: number | null | undefined) {
  if (scheme && scheme !== "wots") return SCHEMES[scheme as SchemeId]?.name ?? scheme;
  return `WOTS leaf #${leaf ?? 0}`;
}

export function CoinCardSkeleton() {
  return (
    <div className="pixel-panel flex flex-col border border-line bg-surface/80 p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-14 w-14" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-4 w-12" />
      </div>
      <div className="mt-4 border border-line bg-bg px-2.5 pb-2.5 pt-2">
        <Skeleton className="mb-1.5 h-2.5 w-28" />
        <DigestGrid cellClass="h-3.5" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-5 h-1 w-full" />
    </div>
  );
}
