import { proxiedImage } from "@/lib/server/img";
import { featuredPumpPairs, supportedQuotes } from "@/lib/server/quotes";

/**
 * Every token a coin can be paired with on pump.fun (name, ticker, image, USD
 * price), with featured pump.fun coins right after SOL. Any other pump.fun
 * coin can be checked with /api/quotes/check. `?proxy=1` serves every logo
 * from our own origin (the brand graphics need that to export as PNG).
 */
export async function GET(request: Request) {
  const proxy = new URL(request.url).searchParams.get("proxy") === "1";
  try {
    const [listed, featured] = await Promise.all([supportedQuotes(), featuredPumpPairs().catch(() => [])]);
    const [sol, ...rest] = listed;
    const quotes = [sol, ...featured, ...rest.filter((t) => !featured.some((f) => f.mint === t.mint))];
    return Response.json({
      quotes: proxy ? quotes.map((t) => ({ ...t, image: t.image && !t.image.startsWith("/") ? proxiedImage(t.image) : t.image })) : quotes,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not load pairs" }, { status: 502 });
  }
}
