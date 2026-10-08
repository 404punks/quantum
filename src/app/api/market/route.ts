import { SOL_MINT, multiPrice, tokenOverview } from "@/lib/server/birdeye";
import { curveStates } from "@/lib/server/solana";
import { isPubkey } from "@/lib/server/validate";

const PUMP_SUPPLY = 1_000_000_000;

/** Grid snapshot: price, mcap, volume, holders and curve progress for up to 48 mints. */
export async function GET(request: Request) {
  const mints = (new URL(request.url).searchParams.get("mints") ?? "")
    .split(",")
    .filter(isPubkey)
    .slice(0, 48);
  if (!mints.length) return Response.json({ solPrice: null, tokens: {} });

  const [prices, curves, overviews] = await Promise.all([
    multiPrice(mints).catch(() => ({}) as Awaited<ReturnType<typeof multiPrice>>),
    curveStates(mints).catch(() => ({}) as Awaited<ReturnType<typeof curveStates>>),
    Promise.all(mints.map((m) => tokenOverview(m).catch(() => null))),
  ]);

  const solPrice = prices[SOL_MINT]?.value ?? null;
  const tokens = Object.fromEntries(
    mints.map((mint, i) => {
      const p = prices[mint];
      const o = overviews[i];
      const curve = curves[mint] ?? null;
      const mcapFromCurve = curve && solPrice ? curve.marketCapSol * solPrice : null;
      return [
        mint,
        {
          price: o?.price ?? p?.value ?? null,
          change24h: o?.priceChange24hPercent ?? p?.priceChange24h ?? null,
          marketCap: o?.marketCap ?? (p?.value ? p.value * PUMP_SUPPLY : mcapFromCurve),
          volume24h: o?.v24hUSD ?? null,
          holders: o?.holder ?? null,
          curve,
          indexed: Boolean(p || o),
        },
      ];
    }),
  );
  return Response.json({ solPrice, tokens });
}
