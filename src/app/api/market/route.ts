import { curveMarketCapsUsd } from "@/lib/server/curve-usd";
import { dexStats, solPrice } from "@/lib/server/dexscreener";
import { holderCounts } from "@/lib/server/holders";
import { lastKnown, remember } from "@/lib/server/last-known";
import { curveStates } from "@/lib/server/solana";
import { isPubkey } from "@/lib/server/validate";

/**
 * Grid snapshot: price, mcap, volume, holders and curve progress for up to 48
 * mints. Market data from DexScreener (keyless), holders from Helius, curve
 * from the chain. No Birdeye calls here: the grid refreshes constantly.
 */
export async function GET(request: Request) {
  const mints = (new URL(request.url).searchParams.get("mints") ?? "")
    .split(",")
    .filter(isPubkey)
    .slice(0, 48);
  if (!mints.length) return Response.json({ solPrice: null, tokens: {} });

  const [stats, curves, holders, sol] = await Promise.all([
    dexStats(mints).catch(() => ({}) as Awaited<ReturnType<typeof dexStats>>),
    curveStates(mints).catch(() => ({}) as Awaited<ReturnType<typeof curveStates>>),
    holderCounts(mints).catch(() => ({}) as Record<string, number>),
    solPrice().catch(() => null),
  ]);

  const curveUsd = await curveMarketCapsUsd(curves, sol).catch(() => ({}) as Record<string, number>);
  const [knownMcap, knownVol, knownHolders] = await Promise.all([lastKnown("mcap"), lastKnown("volume"), lastKnown("holders")]);
  const fresh = { mcap: {} as Record<string, number>, volume: {} as Record<string, number> };
  for (const m of mints) {
    const d = stats[m];
    if (d?.marketCap) fresh.mcap[m] = d.marketCap;
    else if (curveUsd[m]) fresh.mcap[m] = curveUsd[m];
    if (d?.volume24h) fresh.volume[m] = d.volume24h;
  }
  void remember("mcap", fresh.mcap);
  void remember("volume", fresh.volume);
  void remember("holders", holders);
  const tokens = Object.fromEntries(
    mints.map((mint) => {
      const d = stats[mint];
      const curve = curves[mint] ?? null;
      return [
        mint,
        {
          price: d?.price ?? null,
          change24h: d?.change24h ?? null,
          marketCap: d?.marketCap ?? curveUsd[mint] ?? knownMcap[mint] ?? null,
          volume24h: d?.volume24h ?? knownVol[mint] ?? null,
          holders: holders[mint] ?? knownHolders[mint] ?? null,
          curve,
          indexed: Boolean(d),
        },
      ];
    }),
  );
  return Response.json({ solPrice: sol, tokens });
}
