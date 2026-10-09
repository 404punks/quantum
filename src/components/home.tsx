"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import type { LaunchItem, MarketItem } from "@/lib/types";
import { cn, keepKnown } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { CoinCard, CoinCardSkeleton } from "./coin-card";
import { ProofAnimation } from "./proof-animation";
import { PairFilter, type PairFilterValue } from "./pair-filter";
import { ButtonLink, Segmented } from "./ui";

type Sort = "new" | "mcap" | "volume" | "holders";
type Status = "all" | "graduated";
type Kind = "all" | "standard" | "quantum";

const LAUNCH_COLUMNS =
  "mint, name, symbol, description, image_url, creator, pq_address, leaf_index, scheme, message_hash, dev_buy_sol, dev_vault, quote_mint, quote_symbol, quote_image, created_at, launched_at, twitter, telegram, website, pqc_identities(passphrase_hardened, anchor_tx)";

/** Used when the server list route cannot read the database. Live rows are public. */
async function launchesFromBrowser(filters: { kind: Kind; query: string; pair: PairFilterValue }) {
  const supabase = supabaseBrowser();
  let query = supabase.from("pqc_launches").select(LAUNCH_COLUMNS).eq("status", "live").order("launched_at", { ascending: false }).limit(48);
  if (filters.kind === "quantum") query = query.not("dev_vault", "is", null);
  else if (filters.kind === "standard") query = query.is("dev_vault", null);
  if (filters.pair === "sol") query = query.is("quote_mint", null);
  else if (filters.pair === "token") query = query.not("quote_mint", "is", null);
  else if (filters.pair !== "all") query = query.eq("quote_mint", filters.pair);
  const safe = filters.query.replace(/[%,()]/g, "");
  if (safe) query = query.or(`name.ilike.%${safe}%,symbol.ilike.%${safe}%,mint.eq.${safe}`);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((row) => {
    const identity = row.pqc_identities as { passphrase_hardened?: boolean; anchor_tx?: string | null } | { passphrase_hardened?: boolean; anchor_tx?: string | null }[] | null;
    const one = Array.isArray(identity) ? identity[0] : identity;
    const { pqc_identities: _identity, ...rest } = row;
    return {
      ...rest,
      leaf_index: rest.leaf_index ?? 0,
      hardened: Boolean(one?.passphrase_hardened),
      anchored: Boolean(one?.anchor_tx),
    } as LaunchItem;
  });
}

const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: "all", label: "All coins", hint: "Every quantum launch" },
  { value: "standard", label: "Standard", hint: "Post-quantum provenance, dev funds in a wallet" },
  { value: "quantum", label: "Quantum", hint: "Hash-based, dev funds locked in a quantum vault" },
];

export function Home() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl px-4 sm:px-8">
      <section className="grid w-full min-w-0 items-center gap-8 pb-12 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:gap-10 lg:pb-20 lg:pt-16">
        <div className="min-w-0">
          <Link
            href="/docs"
            className="group inline-flex cursor-pointer items-center gap-2 border border-up/30 bg-up/5 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-up transition-all hover:border-up hover:bg-up/10"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-up shadow-[0_0_10px_var(--up)]" />
            Network online · quantum resistant
            <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
          </Link>

          <h1 className="mt-6 font-serif text-[40px] font-bold uppercase leading-[0.95] tracking-[-0.04em] sm:mt-7 sm:text-[68px]">
            Quantum
            <br /><span className="neon-text">launch terminal</span>
          </h1>
          <p className="mt-6 max-w-xl text-[13px] leading-relaxed text-muted sm:text-[14px]">
            Deploy tokens with hash-based signatures and vault-locked dev funds.
            Built for the chain today. Secured for the quantum era.
          </p>

          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
            <ButtonLink href="/launch" variant="primary" className="w-full sm:w-auto">Initialize launch →</ButtonLink>
            <ButtonLink href="/docs" className="w-full sm:w-auto">Read protocol</ButtonLink>
          </div>

          <dl className="mt-8 grid w-full max-w-lg grid-cols-3 border-y border-line py-4 font-mono text-[10px] uppercase tracking-wider sm:mt-11 sm:text-[11px]">
            <div>
              <dt className="text-dim">signature</dt>
              <dd className="mt-1.5 text-up">WOTS+</dd>
            </div>
            <div>
              <dt className="text-dim">identity keys</dt>
              <dd className="mt-1.5 text-fg">256 leaves</dd>
            </div>
            <div>
              <dt className="text-dim">security core</dt>
              <dd className="mt-1.5 text-fg">SHA-256</dd>
            </div>
          </dl>
        </div>

        <div className="relative min-w-0">
          <div aria-hidden className="absolute -inset-6 bg-up/5 blur-3xl" />
          <ProofAnimation className="pixel-panel neon-shadow relative max-w-full" />
        </div>
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
  const [pair, setPair] = useState<PairFilterValue>("all");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter as you type, without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim().slice(0, 44)), 300);
    return () => clearTimeout(t);
  }, [search]);

  // "/" jumps to the search box from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "/" || el?.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Graduation is filtered on the server across every live launch, not just the loaded page.
  const listUrl = useCallback(
    (offset: number) =>
      `/api/launches?offset=${offset}${status === "graduated" ? "&status=graduated" : ""}${sort !== "new" ? `&sort=${sort}` : ""}${kind !== "all" ? `&kind=${kind}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}${pair !== "all" ? `&pair=${pair}` : ""}`,
    [status, sort, kind, query, pair],
  );

  useEffect(() => {
    let cancelled = false;
    setLaunches(null);
    setMarket(null);
    setHasMore(false);
    fetch(listUrl(0))
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j || !Array.isArray(j.launches)) throw new Error(j?.error ?? "Failed to load coins");
        return j as { launches: LaunchItem[]; hasMore?: boolean };
      })
      .then((j) => {
        if (cancelled) return;
        setLaunches(j.launches);
        setHasMore(Boolean(j.hasMore));
      })
      .catch(async () => {
        const fallback = await launchesFromBrowser({ kind, query, pair }).catch(() => [] as LaunchItem[]);
        if (!cancelled) {
          setLaunches(fallback);
          setHasMore(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [listUrl, kind, query, pair]);

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
  const queryRef = useRef(query);
  queryRef.current = query;
  const pairRef = useRef(pair);
  pairRef.current = pair;

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
          quote_mint: row.quote_mint ?? null,
          quote_symbol: row.quote_symbol ?? null,
          quote_image: row.quote_image ?? null,
          created_at: row.created_at ?? new Date().toISOString(),
          launched_at: row.launched_at ?? new Date().toISOString(),
          twitter: row.twitter ?? null,
          telegram: null,
          website: row.website ?? null,
          hardened: false,
          anchored: false,
        };
        if (statusRef.current !== "all" || sortRef.current !== "new" || queryRef.current) return;
        if ((kindRef.current === "quantum" && !item.dev_vault) || (kindRef.current === "standard" && item.dev_vault)) return;
        const p = pairRef.current;
        if ((p === "sol" && item.quote_mint) || (p === "token" && !item.quote_mint) || (p !== "all" && p !== "sol" && p !== "token" && item.quote_mint !== p)) return;
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
        .then((rs) => {
          if (cancelled) return;
          const fresh: Record<string, MarketItem> = Object.assign({}, ...rs.map((j) => j.tokens ?? {}));
          // Never blank a number that was showing just because one refresh came back short.
          setMarket((prev) => Object.fromEntries(Object.entries(fresh).map(([mint, item]) => [mint, keepKnown(prev?.[mint], item)])));
        })
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
    <section className="min-w-0 pb-16">
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
        <div className="flex min-w-0 flex-1 items-center gap-3 md:max-w-md">
          <label className="group flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-3 transition-colors focus-within:border-line-strong hover:border-line-strong">
            <Search size={14} className="shrink-0 text-dim group-focus-within:text-muted" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (setSearch(""), e.currentTarget.blur())}
              placeholder="Search name, ticker or address"
              aria-label="Search coins"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-dim"
            />
            {search ? (
              <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="cursor-pointer text-dim transition-colors hover:text-fg">
                <X size={14} />
              </button>
            ) : (
              <kbd className="hidden rounded border border-line px-1.5 font-mono text-[10.5px] text-dim sm:inline">/</kbd>
            )}
          </label>
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
          <PairFilter value={pair} onChange={setPair} />
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
        query || pair !== "all" ? (
          <div className="flex w-full min-w-0 flex-col items-center rounded-2xl border border-dashed border-line px-4 py-16 text-center">
            <h3 className="font-serif text-[18px] font-bold">{query ? <>No coins match “{query}”</> : "No coins with this pair yet"}</h3>
            <p className="mt-2 max-w-sm text-[13px] text-muted">Try a name, a ticker, or paste a contract address.</p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setPair("all");
              }}
              className="mt-6 cursor-pointer rounded-md border border-line bg-surface px-4 py-2 text-[13px] text-fg transition-colors hover:border-line-strong hover:bg-surface-2"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <Empty filtered={status !== "all" ? "graduated" : kind === "quantum" ? "quantum" : kind === "standard" ? "standard" : null} />
        )
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
    <div className="flex w-full min-w-0 flex-col items-center rounded-2xl border border-dashed border-line px-4 py-16 text-center">
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
