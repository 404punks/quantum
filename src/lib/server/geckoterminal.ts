import "server-only";
import { cached } from "./cache";

/**
 * GeckoTerminal OHLCV: free and keyless, works for pump.fun bonding-curve
 * pools and PumpSwap pools alike. The free tier allows ~30 requests/min, so
 * every chart is cached for 30s and shared across visitors and instances.
 * Failures throw, so a rate-limited response is never cached as an empty chart.
 */

const BASE = "https://api.geckoterminal.com/api/v2/networks/solana/pools/";

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
export type Timeframe = { unit: "minute" | "hour" | "day"; aggregate: number; limit: number };

/** Last successful series per chart: served when GeckoTerminal rate-limits, so a busy page never goes blank. */
const lastGood = new Map<string, Candle[]>();

export async function poolCandles(pool: string, tf: Timeframe): Promise<Candle[]> {
  const key = `gt:ohlcv:${pool}:${tf.unit}:${tf.aggregate}:${tf.limit}`;
  try {
    const candles = await fetchCandles(key, pool, tf);
    lastGood.set(key, candles);
    if (lastGood.size > 2_000) lastGood.delete(lastGood.keys().next().value!);
    return candles;
  } catch (err) {
    const prev = lastGood.get(key);
    if (prev) return prev;
    throw err;
  }
}

function fetchCandles(key: string, pool: string, tf: Timeframe): Promise<Candle[]> {
  return cached(key, 30_000, async () => {
    const res = await fetch(`${BASE}${pool}/ohlcv/${tf.unit}?aggregate=${tf.aggregate}&limit=${tf.limit}&currency=usd&token=base`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      if (res.status === 429) console.warn("geckoterminal 429");
      throw new Error(`geckoterminal ${res.status}`);
    }
    const json = (await res.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
    // Newest first from the API; the chart wants oldest first.
    return (json.data?.attributes?.ohlcv_list ?? []).map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v })).reverse();
  });
}
