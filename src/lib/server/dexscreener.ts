import "server-only";
import { cached } from "./cache";

/**
 * DexScreener: free, keyless market data (price, market cap, 24h volume and
 * change, trades). Covers pump.fun coins on the bonding curve ("pumpfun") and
 * after graduation ("pumpswap"). 30 tokens per request, ~300 requests/min.
 */

const BASE = "https://api.dexscreener.com/tokens/v1/solana/";
const CHUNK = 30;
export const SOL_MINT = "So11111111111111111111111111111111111111112";

type Pair = {
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  txns?: { h24?: { buys: number; sells: number } };
};

export type DexStats = {
  price: number | null;
  marketCap: number | null;
  liquidity: number | null;
  volume24h: number | null;
  change24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  dex: string;
  pair: string;
};

async function fetchPairs(addresses: string[]): Promise<Pair[]> {
  try {
    const res = await fetch(`${BASE}${addresses.join(",")}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 429) console.warn("dexscreener 429");
      return [];
    }
    const json = await res.json();
    return Array.isArray(json) ? (json as Pair[]) : [];
  } catch (err) {
    console.warn("dexscreener", err instanceof Error ? err.name : err);
    return [];
  }
}

const liq = (p: Pair) => p.liquidity?.usd ?? 0;

/** The deepest pair per base token: the bonding curve, or the PumpSwap pool once graduated. */
function bestPairs(pairs: Pair[], wanted: Set<string>) {
  const best = new Map<string, Pair>();
  for (const p of pairs) {
    const m = p.baseToken?.address;
    if (!m || !wanted.has(m)) continue;
    const cur = best.get(m);
    if (!cur || liq(p) > liq(cur) || (liq(p) === liq(cur) && (p.volume?.h24 ?? 0) > (cur.volume?.h24 ?? 0))) best.set(m, p);
  }
  return best;
}

function toStats(p: Pair): DexStats {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const price = p.priceUsd ? Number(p.priceUsd) : null;
  return {
    price: price !== null && Number.isFinite(price) ? price : null,
    marketCap: num(p.marketCap) ?? num(p.fdv),
    liquidity: num(p.liquidity?.usd),
    volume24h: num(p.volume?.h24),
    change24h: num(p.priceChange?.h24),
    buys24h: num(p.txns?.h24?.buys),
    sells24h: num(p.txns?.h24?.sells),
    dex: p.dexId,
    pair: p.pairAddress,
  };
}

/** Stats for many mints: one request per 30, cached 20s and shared across instances. Unlisted mints are absent. */
export async function dexStats(mints: string[]): Promise<Record<string, DexStats>> {
  const list = [...new Set(mints)].sort();
  const chunks: string[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) chunks.push(list.slice(i, i + CHUNK));
  const parts = await Promise.all(
    chunks.map((chunk) =>
      cached(`dex:${chunk.join(",")}`, 20_000, async () => {
        const best = bestPairs(await fetchPairs(chunk), new Set(chunk));
        return Object.fromEntries([...best].map(([m, p]) => [m, toStats(p)]));
      }),
    ),
  );
  return Object.assign({}, ...parts);
}

/** SOL/USD from the deepest SOL-stablecoin pair. */
export function solPrice(): Promise<number | null> {
  return cached("dex:sol-usd", 60_000, async () => {
    const pairs = (await fetchPairs([SOL_MINT])).filter(
      (p) => p.baseToken?.address === SOL_MINT && ["USDC", "USDT"].includes(p.quoteToken?.symbol) && p.priceUsd,
    );
    pairs.sort((a, b) => liq(b) - liq(a));
    const price = pairs[0] ? Number(pairs[0].priceUsd) : NaN;
    return Number.isFinite(price) ? price : null;
  });
}
