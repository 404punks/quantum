import { checkPair } from "@/lib/server/quotes";
import { bad, isPubkey } from "@/lib/server/validate";

/** Can this mint be a pair? Listed tokens, or any pump.fun coin pump.fun can price within range. */
export async function GET(request: Request) {
  const mint = new URL(request.url).searchParams.get("mint");
  if (!isPubkey(mint)) return bad("That isn't a valid token address");
  const check = await checkPair(mint).catch(() => ({ ok: false as const, reason: "Couldn't check that token right now" }));
  return check.ok ? Response.json({ quote: check.token }) : Response.json({ error: check.reason }, { status: 422 });
}
