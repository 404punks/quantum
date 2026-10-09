import { ohlcv } from "@/lib/server/birdeye";
import { dexStats, solPrice } from "@/lib/server/dexscreener";
import { holderCount } from "@/lib/server/holders";
import { curveStates } from "@/lib/server/solana";
import { db } from "@/lib/server/supabase";
import { bad, isPubkey } from "@/lib/server/validate";

const RANGES = {
  "1H": { type: "1m", seconds: 3600 },
  "1D": { type: "15m", seconds: 86_400 },
  "1W": { type: "1H", seconds: 7 * 86_400 },
  "1M": { type: "4H", seconds: 30 * 86_400 },
} as const;

export async function GET(request: Request, ctx: RouteContext<"/api/token/[mint]">) {
  const { mint } = await ctx.params;
  if (!isPubkey(mint)) return bad("Invalid mint");
  const rangeKey = (new URL(request.url).searchParams.get("range") ?? "1D") as keyof typeof RANGES;
  const range = RANGES[rangeKey] ?? RANGES["1D"];

  const { data: launch } = await db
    .from("pqc_launches")
    .select("*, pqc_identities(wallet, pq_address, root, pub_seed, height, passphrase_hardened, anchor_tx, anchored_at, created_at)")
    .eq("mint", mint)
    // Live, or broadcast but not yet confirmed (the launcher lands here straight after submit).
    .or("status.eq.live,and(status.eq.pending,tx_signature.not.is.null)")
    .maybeSingle();
  if (!launch) return bad("Not a pqc.market launch", 404);

  // Market stats: DexScreener + Helius. Birdeye is only used for the chart candles.
  const [stats, holders, candles, curves, sol] = await Promise.all([
    dexStats([mint]).catch(() => ({}) as Awaited<ReturnType<typeof dexStats>>),
    holderCount(mint).catch(() => null),
    ohlcv(mint, range.type, range.seconds).catch(() => []),
    curveStates([mint]).catch(() => ({}) as Awaited<ReturnType<typeof curveStates>>),
    solPrice().catch(() => null),
  ]);
  const d = stats[mint];
  const overview =
    d || holders !== null
      ? {
          price: d?.price ?? null,
          marketCap: d?.marketCap ?? null,
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
    curve: curves[mint] ?? null,
    solPrice: sol,
  });
}
