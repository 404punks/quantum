import { quoteSolTo } from "@/lib/server/jupiter";
import { checkPair } from "@/lib/server/quotes";
import { bad, isPubkey } from "@/lib/server/validate";

/** Live "X SOL ≈ Y token" for the launch form's dev buy on a non-SOL pair. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mint = params.get("mint");
  const sol = Number(params.get("sol"));
  if (!isPubkey(mint)) return bad("Invalid mint");
  if (!Number.isFinite(sol) || sol <= 0 || sol > 50) return bad("Invalid amount");
  const check = await checkPair(mint).catch(() => null);
  if (!check?.ok) return bad(check?.reason ?? "Not a supported pair", 404);
  const token = check.token;
  try {
    const q = await quoteSolTo(mint, BigInt(Math.round(sol * 1e9)));
    const scale = 10 ** token.decimals;
    return Response.json({
      out: Number(q.outAmount) / scale,
      minOut: Number(q.otherAmountThreshold) / scale,
      priceImpactPct: Number(q.priceImpactPct) * 100,
      route: q.routePlan.map((r) => r.swapInfo.label).filter(Boolean),
    });
  } catch (err) {
    return bad(err instanceof Error ? err.message : "No route", 502);
  }
}
