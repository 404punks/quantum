"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { LaunchItem, MarketItem } from "@/lib/types";
import { cn } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { CoinCard, CoinCardSkeleton } from "./coin-card";
import { ProofAnimation } from "./proof-animation";
import { ButtonLink, Segmented } from "./ui";

type Sort = "new" | "mcap" | "volume" | "holders";
type Status = "all" | "graduated";
type Kind = "all" | "standard" | "quantum";

const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: "all", label: "All coins", hint: "Every pqc.market launch" },
  { value: "standard", label: "Standard", hint: "Post-quantum provenance, dev funds in a wallet" },
  { value: "quantum", label: "Quantum", hint: "Hash-based, dev funds locked in a quantum vault" },
];

export function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="grid items-center gap-10 pb-16 pt-6 lg:grid-cols-[1fr_minmax(0,500px)] lg:pt-10">
        <div>
          <Link
            href="/docs"
            className="group inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-3.5 py-1.5 text-[12px] text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-up" />
            Bunker mode: why hash-based keys matter now
            <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
          </Link>

          <h1 className="mt-6 font-serif text-[36px] font-bold leading-[1.08] tracking-tight sm:text-[50px]">
            Launch coins that
            <br />
            survive <span className="italic text-up">Q-day</span>.
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">
            Every coin is signed by a one-time, hash-based key derived from your wallet. Live on pump.fun, with provenance
            that outlives ECDSA.
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            <ButtonLink href="/launch" variant="primary">Launch a coin</ButtonLink>
            <ButtonLink href="/docs">How it works</ButtonLink>
          </div>

          <dl className="mt-10 flex gap-8 font-mono text-[12px]">
            <div>
              <dt className="text-dim">signature</dt>
              <dd className="mt-1 text-fg">2,404 B</dd>
            </div>
            <div>
              <dt className="text-dim">keys / identity</dt>
              <dd className="mt-1 text-fg">256</dd>
            </div>
            <div>
              <dt className="text-dim">assumption</dt>
              <dd className="mt-1 text-fg">SHA-256</dd>
            </div>
          </dl>
        </div>

        <ProofAnimation />
      </section>

      <CoinsSection />
    </div>
  );
}

function CoinsSection() {
  const [launches, setLaunches] = useState<LaunchItem[] | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [live, setLive] = useState(false);
  const [market, setMarket] = useState<Record<string, MarketItem> | null>(null);
  const [sort, setSort] = useState<Sort>("new");
  const [status, setStatus] = useState<Status>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Graduation is filtered on the server across every live launch, not just the loaded page.
  const listUrl = useCallback(
    (offset: number) =>
      `/api/launches?offset=${offset}${status === "graduated" ? "&status=graduated" : ""}${sort !== "new" ? `&sort=${sort}` : ""}${kind !== "all" ? `&kind=${kind}` : ""}`,
    [status, sort, kind],
  );

  useEffect(() => {
    let cancelled = false;
    setLaunches(null);
    setMarket(null);
    setHasMore(false);
    fetch(listUrl(0))
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setLaunches(j.launches ?? []);
        setHasMore(Boolean(j.hasMore));
      })
      .catch(() => !cancelled && setLaunches([]));
    return () => {
      cancelled = true;
    };
  }, [listUrl]);

  async function loadMore() {
    if (!launches || loadingMore) return;
    setLoadingMore(true);
    try {
      const j = await fetch(listUrl(launches.length)).then((r) => r.json());
      setLaunches((prev) => {
        const seen = new Set((prev ?? []).map((l) => l.mint));
        return [...(prev ?? []), ...((j.launches ?? []) as LaunchItem[]).filter((l) => !seen.has(l.mint))];
      });
      setHasMore(Boolean(j.hasMore));
    } finally {
      setLoadingMore(false);
    }
  }

  const statusRef = useRef(status);
  statusRef.current = status;
  const sortRef = useRef(sort);
  sortRef.current = sort;
  const kindRef = useRef(kind);
  kindRef.current = kind;

  // Realtime Broadcast: the server announces each launch once it is live. No
  // database polling or per-tab RLS checks, unlike postgres_changes.
  useEffect(() => {
    const supabase = supabaseBrowser();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const channel = supabase
      .channel("pqc-launches-feed")
      .on("broadcast", { event: "launch" }, ({ payload }) => {
        const row = payload as Partial<LaunchItem> & { status?: string };
        if (!row?.mint || row.status !== "live") return;
        const item: LaunchItem = {
          mint: row.mint,
          name: row.name ?? "",
          symbol: row.symbol ?? "",
          description: row.description ?? null,
          image_url: row.image_url ?? null,
          creator: row.creator ?? "",
          pq_address: row.pq_address ?? "",
          leaf_index: row.leaf_index ?? 0,
          message_hash: row.message_hash,
          dev_buy_sol: Number(row.dev_buy_sol ?? 0),
          dev_vault: row.dev_vault ?? null,
          created_at: row.created_at ?? new Date().toISOString(),
          launched_at: row.launched_at ?? new Date().toISOString(),
          twitter: row.twitter ?? null,
          telegram: null,
          website: row.website ?? null,
          hardened: false,
          anchored: false,
        };
        if (statusRef.current !== "all" || sortRef.current !== "new") return;
        if ((kindRef.current === "quantum" && !item.dev_vault) || (kindRef.current === "standard" && item.dev_vault)) return;
        setLaunches((prev) => (prev && !prev.some((l) => l.mint === item.mint) ? [item, ...prev] : prev));
        setFresh((prev) => new Set(prev).add(item.mint));
        timers.push(
          setTimeout(() => setFresh((prev) => {
            const next = new Set(prev);
            next.delete(item.mint);
            return next;
          }), 8_000),
        );
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      timers.forEach(clearTimeout);
      void supabase.removeChannel(channel);
    };
  }, []);

  const mints = useMemo(() => (launches ?? []).map((l) => l.mint).join(","), [launches]);

  useEffect(() => {
    if (!launches) return;
    if (!mints) {
      setMarket({});
      return;
    }
    let cancelled = false;
    const list = mints.split(",");
    const chunks: string[][] = [];
    for (let i = 0; i < list.length; i += 48) chunks.push(list.slice(i, i + 48));
    const load = () =>
      Promise.all(chunks.map((c) => fetch(`/api/market?mints=${c.join(",")}`).then((r) => r.json())))
        .then((rs) => !cancelled && setMarket(Object.assign({}, ...rs.map((j) => j.tokens ?? {}))))
        .catch(() => !cancelled && setMarket((m) => m ?? {}));
    void load();
    const timer = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [mints, launches]);

  const visible = useMemo(() => {
    if (!launches) return null;
    const m = market ?? {};
    // Ranking happens on the server across every coin, so the page order is already correct.
    void m;
    return [...launches];
  }, [launches, market]);

  return (
    <section className="min-h-[110vh] pb-24">
      <div className="mb-5 flex items-end justify-between gap-4 border-b border-line">
        <div role="tablist" aria-label="Coin type" className="-mb-px flex gap-6 sm:gap-8">
          {KINDS.map((k) => (
            <button
              key={k.value}
              role="tab"
              aria-selected={kind === k.value}
              title={k.hint}
              onClick={() => setKind(k.value)}
              className={cn(
                "cursor-pointer border-b-2 pb-3 font-serif text-[20px] font-bold leading-none transition-colors sm:text-[24px]",
                kind === k.value ? "border-fg text-fg" : "border-transparent text-dim hover:text-muted",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="hidden pb-3 text-right text-[12px] text-dim md:block">{KINDS.find((k) => k.value === kind)?.hint}</p>
      </div>
      <div className="flex flex-col gap-4 pb-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span
            title={live ? "New launches stream in automatically" : "Connecting to live feed"}
            className={cn("flex items-center gap-1.5 font-mono text-[11px]", live ? "text-up" : "text-dim")}
          >
            <span className={cn("h-1.5 w-1.5", live ? "animate-pulse bg-up" : "bg-dim")} />
            {live ? "live" : "connecting"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              { value: "new", label: "Newest" },
              { value: "mcap", label: "Market cap" },
              { value: "volume", label: "Volume" },
              { value: "holders", label: "Holders" },
            ]}
          />
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All" },
              { value: "graduated", label: "Graduated" },
            ]}
          />
        </div>
      </div>

      {visible === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <CoinCardSkeleton key={i} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Empty filtered={status !== "all" ? "graduated" : kind === "quantum" ? "quantum" : kind === "standard" ? "standard" : null} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((l) => (
            <CoinCard key={l.mint} launch={l} market={market?.[l.mint]} marketLoading={market === null} fresh={fresh.has(l.mint)} />
          ))}
        </div>
      )}
      {hasMore && visible && visible.length > 0 && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="cursor-pointer rounded-md border border-line bg-surface px-5 py-2.5 text-[13px] text-fg transition-colors hover:border-line-strong hover:bg-surface-2 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more coins"}
          </button>
        </div>
      )}
    </section>
  );
}

function Empty({ filtered }: { filtered: "graduated" | "quantum" | "standard" | null }) {
  const copy = {
    graduated: ["Nothing graduated yet", "Coins graduate when their bonding curve fills and liquidity moves to PumpSwap."],
    quantum: ["No quantum coins yet", "Quantum launches put the dev buy straight into a vault only a hash-based signature can open."],
    standard: ["No standard coins yet", "Standard launches carry a post-quantum provenance signature with any of the eight schemes."],
  } as const;
  const [title, body] = filtered ? copy[filtered] : ["No coins yet", "Be the first to launch a coin with a hash-based, post-quantum provenance signature."];
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-4 py-20 text-center">
      <h3 className="font-serif text-[18px] font-bold">{title}</h3>
      <p className="mt-2 max-w-sm text-[13px] text-muted">{body}</p>
      {filtered !== "graduated" && (
        <ButtonLink href="/launch" variant="primary" className="mt-6">
          {filtered === "quantum" ? "Launch a quantum coin" : filtered ? "Launch a coin" : "Launch the first coin"}
        </ButtonLink>
      )}
    </div>
  );
}
