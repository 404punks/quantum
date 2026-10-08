"use client";

import Link from "next/link";
import type { LaunchItem, MarketItem } from "@/lib/types";
import { ago, cn, num, pct, usd } from "@/lib/format";
import { SCHEMES, type SchemeId } from "@/lib/pq/scheme-info";
import { DigestGrid } from "./digest-grid";
import { Skeleton } from "./ui";

type CardLaunch = Pick<LaunchItem, "mint" | "name" | "symbol" | "image_url" | "leaf_index"> &
  Partial<Pick<LaunchItem, "launched_at" | "message_hash" | "scheme">> & { digest?: Uint8Array };

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

  const body = (
    <>
      {fresh && (
        <span className="absolute -top-2.5 left-4 border border-up/60 bg-bg px-1.5 font-mono text-[10px] text-up">just launched</span>
      )}
      <header className="flex items-start gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden border border-line bg-surface-2">
          {launch.image_url ? (
            <img src={launch.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-serif text-lg text-dim">{launch.symbol?.[0] ?? "?"}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-fg group-hover:underline">{launch.name || "Untitled"}</h3>
          <div className="mt-0.5 font-mono text-[12px] text-muted">${launch.symbol || "TICKER"}</div>
          <div className="mt-1.5 font-mono text-[11px] text-dim">
            {schemeLabel(launch.scheme, launch.leaf_index)}
            {launch.launched_at && <> · {ago(launch.launched_at)}</>}
          </div>
        </div>
        <div className={cn("font-mono text-[13px]", change == null ? "text-dim" : up ? "text-up" : "text-down")}>
          {marketLoading ? <Skeleton className="h-4 w-14" /> : pct(change)}
        </div>
      </header>

      <div className="mt-4 border border-line bg-bg px-2.5 pb-2.5 pt-2">
        <div className="mb-1.5 flex justify-between font-mono text-[10px] text-dim">
          <span>attestation digest</span>
          <span>{launch.scheme && launch.scheme !== "wots" ? SCHEMES[launch.scheme as SchemeId]?.aka : `leaf #${launch.leaf_index}`}</span>
        </div>
        <DigestGrid digest={launch.digest ?? launch.message_hash} cellClass="h-3.5" />
      </div>

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
            style={{ width: `${Math.max(progress * 100, 1)}%` }}
          />
        </div>
      </div>
    </>
  );

  const className = cn(
    "fade-up group relative flex flex-col border bg-surface p-4 transition-colors duration-700",
    fresh ? "border-up/70 shadow-[0_0_0_1px_var(--up),0_0_28px_-8px_var(--up)]" : "border-line",
  );
  if (preview) return <article className={className}>{body}</article>;
  return (
    <Link href={`/coin/${launch.mint}`} className={cn(className, "cursor-pointer hover:border-line-strong hover:bg-surface-2")}>
      {body}
    </Link>
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
    <div className="flex flex-col border border-line bg-surface p-4">
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
