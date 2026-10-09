import "server-only";
import { bondingCurvePda, bondingCurveMarketCap } from "@pump-fun/pump-sdk";
import { NATIVE_MINT } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { cached } from "./cache";
import { dexStatsChecked, solPrice } from "./dexscreener";
import { holderCounts } from "./holders";
import { LAMPORTS_PER_SOL, connection, pumpSdk } from "./solana";

export type RankSort = "mcap" | "volume" | "holders";

/** Bonding-curve market cap in USD for coins DexScreener didn't return (chunked: max 100 accounts per RPC call). */
async function curveMarketCaps(mints: string[], sol: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100);
    const infos = await connection.getMultipleAccountsInfo(chunk.map((m) => bondingCurvePda(m)));
    infos.forEach((info, j) => {
      const c = info ? pumpSdk.decodeBondingCurveNullable(info) : null;
      if (!c || c.virtualTokenReserves.isZero()) return;
      // Only SOL-quoted curves can be priced from lamport reserves.
      if (!c.quoteMint.equals(PublicKey.default) && !c.quoteMint.equals(NATIVE_MINT)) return;
      const lamports = bondingCurveMarketCap({
        mintSupply: c.tokenTotalSupply,
        virtualQuoteReserves: c.virtualQuoteReserves,
        virtualTokenReserves: c.virtualTokenReserves,
      }).toNumber();
      out[chunk[j]] = (lamports / LAMPORTS_PER_SOL) * sol;
    });
  }
  return out;
}

/**
 * The value each coin is ranked by, and whether the data is complete enough to
 * cache. A failed DexScreener batch or missing holder counts would otherwise sink
 * big coins to the bottom (behind "Load more") for everyone until it expired.
 */
async function metric(mints: string[], sort: RankSort): Promise<{ values: Record<string, number>; complete: boolean }> {
  if (sort === "holders") {
    const values = await holderCounts(mints);
    return { values, complete: Object.keys(values).length >= mints.length * 0.98 };
  }
  const { stats, incomplete } = await dexStatsChecked(mints);
  const values: Record<string, number> = {};
  for (const m of mints) {
    const v = sort === "mcap" ? stats[m]?.marketCap : stats[m]?.volume24h;
    if (typeof v === "number") values[m] = v;
  }
  if (sort === "volume") return { values, complete: !incomplete };

  // Market cap: anything DexScreener didn't return is priced from its bonding curve.
  const missing = mints.filter((m) => values[m] === undefined);
  if (missing.length) {
    const sol = await solPrice().catch(() => null);
    if (sol) Object.assign(values, await curveMarketCaps(missing, sol).catch(() => ({})));
  }
  const stillMissing = mints.filter((m) => values[m] === undefined).length;
  return { values, complete: !incomplete && stillMissing <= Math.max(2, mints.length * 0.02) };
}

/** An order computed from partial data: served for this request, never cached. */
class PartialRanking extends Error {
  constructor(readonly order: string[]) {
    super("partial ranking");
  }
}

/**
 * Every given mint, ordered by the metric (desc). Coins with no data sink to the
 * bottom in their original (newest-first) order. Cached 60s so paging is stable,
 * but only when the data behind it is complete.
 */
export async function rankMints(mints: string[], sort: RankSort): Promise<string[]> {
  if (!mints.length) return [];
  const key = `rank:v2:${sort}:${mints.length}:${[...mints].sort().join(",")}`;
  try {
    return await cached(key, 60_000, async () => {
      const { values, complete } = await metric(mints, sort);
      const pos = new Map(mints.map((m, i) => [m, i]));
      const order = [...mints].sort((a, b) => {
        const va = values[a];
        const vb = values[b];
        if (va === undefined && vb === undefined) return pos.get(a)! - pos.get(b)!;
        if (va === undefined) return 1;
        if (vb === undefined) return -1;
        return vb - va;
      });
      if (!complete) throw new PartialRanking(order);
      return order;
    });
  } catch (err) {
    if (err instanceof PartialRanking) return err.order;
    throw err;
  }
}
