import "server-only";
import { bondingCurvePda, bondingCurveMarketCap } from "@pump-fun/pump-sdk";
import { SOL_MINT, multiPrice, tokenOverview } from "./birdeye";
import { cached } from "./cache";
import { LAMPORTS_PER_SOL, connection, pumpSdk } from "./solana";

export type RankSort = "mcap" | "volume" | "holders";

const PUMP_SUPPLY = 1_000_000_000;
const OVERVIEW_CONCURRENCY = 8;

/** Runs `fn` over items with at most `limit` in flight (keeps Birdeye under its rate limit). */
async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Bonding-curve market cap in USD for coins Birdeye hasn't priced yet (chunked: max 100 accounts per RPC call). */
async function curveMarketCaps(mints: string[], solPrice: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100);
    const infos = await connection.getMultipleAccountsInfo(chunk.map((m) => bondingCurvePda(m)));
    infos.forEach((info, j) => {
      const c = info ? pumpSdk.decodeBondingCurveNullable(info) : null;
      if (!c || c.virtualTokenReserves.isZero()) return;
      const sol =
        bondingCurveMarketCap({ mintSupply: c.tokenTotalSupply, virtualQuoteReserves: c.virtualQuoteReserves, virtualTokenReserves: c.virtualTokenReserves }).toNumber() /
        LAMPORTS_PER_SOL;
      out[chunk[j]] = sol * solPrice;
    });
  }
  return out;
}

/** Slow-moving per-coin stats for ranking only; a longer TTL than the live grid keeps credit use bounded. */
function rankingOverview(mint: string) {
  return cached(`be:overview-rank:${mint}`, 5 * 60_000, () => tokenOverview(mint).catch(() => null));
}

async function metric(mints: string[], sort: RankSort): Promise<Record<string, number>> {
  if (sort === "mcap") {
    const prices = await multiPrice(mints);
    const solPrice = prices[SOL_MINT]?.value ?? 0;
    const out: Record<string, number> = {};
    const unpriced: string[] = [];
    for (const m of mints) {
      const p = prices[m]?.value;
      if (p) out[m] = p * PUMP_SUPPLY;
      else unpriced.push(m);
    }
    if (unpriced.length && solPrice) Object.assign(out, await curveMarketCaps(unpriced, solPrice).catch(() => ({})));
    return out;
  }
  const overviews = await pool(mints, OVERVIEW_CONCURRENCY, rankingOverview);
  const out: Record<string, number> = {};
  mints.forEach((m, i) => {
    const o = overviews[i];
    const v = sort === "volume" ? o?.v24hUSD : o?.holder;
    if (typeof v === "number") out[m] = v;
  });
  return out;
}

/**
 * Every given mint, ordered by the metric (desc). Coins with no data sink to the
 * bottom in their original (newest-first) order. Cached so paging is stable.
 */
export function rankMints(mints: string[], sort: RankSort): Promise<string[]> {
  if (!mints.length) return Promise.resolve([]);
  const key = `rank:${sort}:${mints.length}:${[...mints].sort().join(",")}`;
  return cached(key, 60_000, async () => {
    const values = await metric(mints, sort);
    const pos = new Map(mints.map((m, i) => [m, i]));
    return [...mints].sort((a, b) => {
      const va = values[a];
      const vb = values[b];
      if (va === undefined && vb === undefined) return pos.get(a)! - pos.get(b)!;
      if (va === undefined) return 1;
      if (vb === undefined) return -1;
      return vb - va;
    });
  });
}
