import "server-only";
import { cached } from "./cache";

// Market data, holders and charts come from DexScreener, Helius and GeckoTerminal.
// Birdeye remains only for token metadata and creation info (admin import, wallet names).

const BASE = "https://public-api.birdeye.so";

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

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

/**
 * Chart fallback when GeckoTerminal is rate-limited (its free tier is per IP,
 * and cloud egress IPs are shared). Throws on failure so nothing empty is cached.
 */
export function ohlcv(mint: string, type: "1m" | "15m" | "1H" | "4H", seconds: number) {
  return cached(`be:ohlcv:${mint}:${type}:${seconds}`, 60_000, async () => {
    const to = Math.floor(Date.now() / 1000);
    const data = await birdeye<{ items: { unix_time: number; o: number; h: number; l: number; c: number; v_usd: number }[] }>(
      `/defi/v3/ohlcv?address=${mint}&type=${type}&time_from=${to - seconds}&time_to=${to}`,
    );
    if (!data) throw new Error("birdeye ohlcv unavailable");
    return data.items.map((x): Candle => ({ t: x.unix_time, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v_usd }));
  });
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
