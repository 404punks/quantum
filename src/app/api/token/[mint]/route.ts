import { ohlcv } from "@/lib/server/birdeye";
import { cached } from "@/lib/server/cache";
import { curveMarketCapsUsd } from "@/lib/server/curve-usd";
import { dexStats, solPrice } from "@/lib/server/dexscreener";
import { poolCandles, type Timeframe } from "@/lib/server/geckoterminal";
import { holderCount } from "@/lib/server/holders";
import { curveStates } from "@/lib/server/solana";
import { db } from "@/lib/server/supabase";
import { bad, isPubkey } from "@/lib/server/validate";

type Range = { gecko: Timeframe; birdeye: { type: "1m" | "15m" | "1H" | "4H"; seconds: number } };

const RANGES: Record<string, Range> = {
  "1H": { gecko: { unit: "minute", aggregate: 1, limit: 60 }, birdeye: { type: "1m", seconds: 3600 } },
  "1D": { gecko: { unit: "minute", aggregate: 15, limit: 96 }, birdeye: { type: "15m", seconds: 86_400 } },
  "1W": { gecko: { unit: "hour", aggregate: 1, limit: 168 }, birdeye: { type: "1H", seconds: 7 * 86_400 } },
  "1M": { gecko: { unit: "hour", aggregate: 4, limit: 180 }, birdeye: { type: "4H", seconds: 30 * 86_400 } },
};

/**
 * GeckoTerminal first (keyless). Its free limit is per IP and cloud egress IPs
 * are shared, so when it is rate-limited (or the pool lookup failed) Birdeye,
 * which needs only the mint, fills in. Throws only if both fail.
 */
async function chartCandles(mint: string, pool: string | null, range: Range) {
  if (pool) {
    try {
      return await poolCandles(pool, range.gecko);
    } catch {
      // fall through to Birdeye
    }
  }
  return ohlcv(mint, range.birdeye.type, range.birdeye.seconds);
}

const LAUNCH_SELECT =
  "*, pqc_identities(wallet, pq_address, root, pub_seed, height, passphrase_hardened, anchor_tx, anchored_at, created_at)";

class Uncacheable extends Error {
  constructor(readonly row: Record<string, unknown> | null) {
    super("uncacheable");
  }
}

/**
 * The launch and its identity. A live launch never changes, so it is cached for
 * 60s (an open coin page polls every 30s); a pending one is always read fresh.
 */
async function launchRow(mint: string): Promise<Record<string, unknown> | null> {
  try {
    return await cached(`launch:row:${mint}`, 60_000, async () => {
      const { data, error } = await db
        .from("pqc_launches")
        .select(LAUNCH_SELECT)
        .eq("mint", mint)
        // Live, or broadcast but not yet confirmed (the launcher lands here straight after submit).
        .or("status.eq.live,and(status.eq.pending,tx_signature.not.is.null)")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data || data.status !== "live") throw new Uncacheable(data);
      return data as Record<string, unknown>;
    });
  } catch (err) {
    if (err instanceof Uncacheable) return err.row;
    throw err;
  }
}

export async function GET(request: Request, ctx: RouteContext<"/api/token/[mint]">) {
  const { mint } = await ctx.params;
  if (!isPubkey(mint)) return bad("Invalid mint");
  const range = RANGES[new URL(request.url).searchParams.get("range") ?? "1D"] ?? RANGES["1D"];

  const launch = await launchRow(mint);
  if (!launch) return bad("Not a pqc.market launch", 404);

  // Stats from DexScreener + Helius; candles from GeckoTerminal for the coin's deepest pool.
  const [stats, holders, curves, sol] = await Promise.all([
    dexStats([mint]).catch(() => ({}) as Awaited<ReturnType<typeof dexStats>>),
    holderCount(mint).catch(() => null),
    curveStates([mint]).catch(() => ({}) as Awaited<ReturnType<typeof curveStates>>),
    solPrice().catch(() => null),
  ]);
  const d = stats[mint];
  // Coins paired with a token aren't priced by data providers yet: use the curve.
  const curveUsd = d?.marketCap ? null : ((await curveMarketCapsUsd(curves, sol).catch(() => ({}) as Record<string, number>))[mint] ?? null);
  // candlesOk=false means every chart source failed (not "no trades"), so the page keeps what it has.
  let candlesOk = true;
  const candles = await chartCandles(mint, d?.pair ?? null, range).catch(() => {
    candlesOk = false;
    return [];
  });
  const overview =
    d || holders !== null || curveUsd !== null
      ? {
          price: d?.price ?? (curveUsd !== null ? curveUsd / 1_000_000_000 : null),
          marketCap: d?.marketCap ?? curveUsd,
          liquidity: d?.liquidity ?? null,
          holder: holders,
          v24hUSD: d?.volume24h ?? null,
          priceChange24hPercent: d?.change24h ?? null,
          trade24h: d && d.buys24h !== null && d.sells24h !== null ? d.buys24h + d.sells24h : null,
          buys24h: d?.buys24h ?? null,
          sells24h: d?.sells24h ?? null,
        }
      : null;

  const { pqc_identities: identity, ...row } = launch;
  return Response.json({
    launch: row,
    identity,
    overview,
    candles,
    candlesOk,
    curve: curves[mint] ?? null,
    solPrice: sol,
  });
}
