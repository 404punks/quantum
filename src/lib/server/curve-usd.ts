import "server-only";
import { dexStats } from "./dexscreener";
import { checkPair } from "./quotes";
import type { CurveState } from "./solana";

/**
 * Bonding-curve market caps in USD, including curves paired with a token
 * (USDC, a stock, a memecoin): data providers don't price those coins yet, so
 * the cap is the curve's own market cap in the pair token times that token's
 * USD price. SOL curves use the SOL price.
 */
export async function curveMarketCapsUsd(curves: Record<string, CurveState>, solUsd: number | null): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const quoteMints = [...new Set(Object.values(curves).flatMap((c) => (c.quoteMint ? [c.quoteMint] : [])))];
  const [prices, decimals] = await Promise.all([
    quoteMints.length ? dexStats(quoteMints).catch(() => ({}) as Awaited<ReturnType<typeof dexStats>>) : Promise.resolve({} as Awaited<ReturnType<typeof dexStats>>),
    Promise.all(quoteMints.map((m) => checkPair(m).then((c) => (c.ok ? c.token.decimals : null)).catch(() => null))),
  ]);
  const dec = new Map(quoteMints.map((m, i) => [m, decimals[i]]));
  for (const [mint, c] of Object.entries(curves)) {
    if (c.marketCapSol != null && solUsd) out[mint] = c.marketCapSol * solUsd;
    else if (c.quoteMint && c.marketCapQuoteRaw != null) {
      const price = prices[c.quoteMint]?.price;
      const d = dec.get(c.quoteMint);
      if (price && d != null) out[mint] = (c.marketCapQuoteRaw / 10 ** d) * price;
    }
  }
  return out;
}
