import "server-only";
import { bondingCurvePda, bondingCurveMarketCap } from "@pump-fun/pump-sdk";
import { cached } from "./cache";
import { dexStats, solPrice } from "./dexscreener";
import { holderCounts } from "./holders";
import { LAMPORTS_PER_SOL, connection, pumpSdk } from "./solana";

export type RankSort = "mcap" | "volume" | "holders";

/** Bonding-curve market cap in USD for coins DexScreener hasn't listed yet (chunked: max 100 accounts per RPC call). */
async function curveMarketCaps(mints: string[], sol: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100);
    const infos = await connection.getMultipleAccountsInfo(chunk.map((m) => bondingCurvePda(m)));
    infos.forEach((info, j) => {
      const c = info ? pumpSdk.decodeBondingCurveNullable(info) : null;
      if (!c || c.virtualTokenReserves.isZero()) return;
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

async function metric(mints: string[], sort: RankSort): Promise<Record<string, number>> {
  if (sort === "holders") return holderCounts(mints);
  const stats = await dexStats(mints);
  const out: Record<string, number> = {};
  for (const m of mints) {
    const v = sort === "mcap" ? stats[m]?.marketCap : stats[m]?.volume24h;
    if (typeof v === "number") out[m] = v;
  }
  if (sort === "mcap") {
    const unpriced = mints.filter((m) => out[m] === undefined);
    const sol = unpriced.length ? await solPrice().catch(() => null) : null;
    if (unpriced.length && sol) Object.assign(out, await curveMarketCaps(unpriced, sol).catch(() => ({})));
  }
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
