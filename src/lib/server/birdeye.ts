import "server-only";
import { cached } from "./cache";

const BASE = "https://public-api.birdeye.so";
export const SOL_MINT = "So11111111111111111111111111111111111111112";

async function birdeye<T>(path: string): Promise<T | null> {
  // One slow Birdeye response must not hold a whole grid refresh hostage.
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: {
        "X-API-KEY": process.env.BIRDEYE_API_KEY!,
        "x-chain": "solana",
        accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    console.warn("birdeye", path.split("?")[0], err instanceof Error ? err.name : err);
    return null;
  }
  if (!res.ok) {
    if (res.status === 429) console.warn("birdeye 429", path);
    return null;
  }
  const json = (await res.json()) as { success: boolean; data?: T };
  return json.success ? (json.data ?? null) : null;
}

export type Price = { value: number; priceChange24h: number | null; liquidity: number | null };

/** One call for the whole grid. Unindexed mints are simply absent. */
export function multiPrice(mints: string[]) {
  const list = [...new Set([...mints, SOL_MINT])].sort();
  return cached(`be:multi:${list.join(",")}`, 10_000, async () => {
    const out: Record<string, Price> = {};
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      const data = await birdeye<Record<string, Price | null>>(
        `/defi/multi_price?list_address=${chunk.join(",")}&include_liquidity=true`,
      );
      for (const [k, v] of Object.entries(data ?? {})) if (v) out[k] = v;
    }
    return out;
  });
}

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

export function ohlcv(mint: string, type: "1m" | "5m" | "15m" | "1H" | "4H" | "1D", seconds: number) {
  return cached(`be:ohlcv:${mint}:${type}:${seconds}`, 15_000, async () => {
    const to = Math.floor(Date.now() / 1000);
    const data = await birdeye<{ items: { unix_time: number; o: number; h: number; l: number; c: number; v_usd: number }[] }>(
      `/defi/v3/ohlcv?address=${mint}&type=${type}&time_from=${to - seconds}&time_to=${to}`,
    );
    return (data?.items ?? []).map((x) => ({ t: x.unix_time, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v_usd }));
  });
}

export type Overview = {
  price: number;
  marketCap: number;
  liquidity: number;
  holder: number;
  v24hUSD: number;
  priceChange24hPercent: number;
  trade24h: number;
  uniqueWallet24h: number;
};

export function tokenOverview(mint: string) {
  return cached(`be:overview:${mint}`, 15_000, () =>
    birdeye<Overview>(`/defi/token_overview?address=${mint}&frames=1h,24h`),
  );
}

export type TokenMeta = {
  address: string;
  name: string;
  symbol: string;
  logo_uri?: string;
  extensions?: { description?: string; twitter?: string; website?: string } | null;
};

export function tokenMeta(mint: string) {
  return cached(`be:meta:${mint}`, 60 * 60_000, () => birdeye<TokenMeta>(`/defi/v3/token/meta-data/single?address=${mint}`));
}

export type CreationInfo = { txHash: string; owner: string; blockUnixTime: number };

export function tokenCreation(mint: string) {
  return cached(`be:creation:${mint}`, 60 * 60_000, () => birdeye<CreationInfo>(`/defi/token_creation_info?address=${mint}`));
}
