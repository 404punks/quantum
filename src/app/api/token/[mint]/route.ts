import { SOL_MINT, multiPrice, ohlcv, tokenOverview } from "@/lib/server/birdeye";
import { curveStates } from "@/lib/server/solana";
import { db } from "@/lib/server/supabase";
import { bad, isPubkey } from "@/lib/server/validate";

const RANGES = {
  "1H": { type: "1m", seconds: 3600 },
  "1D": { type: "15m", seconds: 86_400 },
  "1W": { type: "1H", seconds: 7 * 86_400 },
  "1M": { type: "4H", seconds: 30 * 86_400 },
} as const;

export async function GET(request: Request, ctx: RouteContext<"/api/token/[mint]">) {
  const { mint } = await ctx.params;
  if (!isPubkey(mint)) return bad("Invalid mint");
  const rangeKey = (new URL(request.url).searchParams.get("range") ?? "1D") as keyof typeof RANGES;
  const range = RANGES[rangeKey] ?? RANGES["1D"];

  const { data: launch } = await db
    .from("pqc_launches")
    .select("*, pqc_identities(wallet, pq_address, root, pub_seed, height, passphrase_hardened, anchor_tx, anchored_at, created_at)")
    .eq("mint", mint)
    // Live, or broadcast but not yet confirmed (the launcher lands here straight after submit).
    .or("status.eq.live,and(status.eq.pending,tx_signature.not.is.null)")
    .maybeSingle();
  if (!launch) return bad("Not a pqc.market launch", 404);

  const [overview, candles, curves, prices] = await Promise.all([
    tokenOverview(mint).catch(() => null),
    ohlcv(mint, range.type, range.seconds).catch(() => []),
    curveStates([mint]).catch(() => ({}) as Awaited<ReturnType<typeof curveStates>>),
    multiPrice([mint]).catch(() => ({}) as Awaited<ReturnType<typeof multiPrice>>),
  ]);

  const { pqc_identities: identity, ...row } = launch;
  return Response.json({
    launch: row,
    identity,
    overview,
    candles,
    curve: curves[mint] ?? null,
    solPrice: prices[SOL_MINT]?.value ?? null,
  });
}
