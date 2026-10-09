import "server-only";
import { cached } from "./cache";
import { curveMarketCapsUsd } from "./curve-usd";
import { dexStatsChecked, solPrice } from "./dexscreener";
import { holderCounts } from "./holders";
import { curveStates, type CurveState } from "./solana";

export type RankSort = "mcap" | "volume" | "holders";

/** Curve states in batches of 100 (getMultipleAccounts' limit). */
async function curvesFor(mints: string[]): Promise<Record<string, CurveState>> {
  const chunks: string[][] = [];
  for (let i = 0; i < mints.length; i += 100) chunks.push(mints.slice(i, i + 100));
  return Object.assign({}, ...(await Promise.all(chunks.map((c) => curveStates(c)))));
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

  // Market cap: anything DexScreener didn't return is priced from its bonding
  // curve, SOL-paired or token-paired (via the pair token's USD price).
  const missing = mints.filter((m) => values[m] === undefined);
  if (missing.length) {
    const [sol, curves] = await Promise.all([solPrice().catch(() => null), curvesFor(missing).catch(() => ({}) as Record<string, CurveState>)]);
    Object.assign(values, await curveMarketCapsUsd(curves, sol).catch(() => ({})));
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
