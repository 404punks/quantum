import { thumb } from "@/lib/format";
import { proxiedImage } from "@/lib/server/img";
import { bad, isPubkey } from "@/lib/server/validate";

/**
 * A coin's page data for brand graphics, with the image served from our own
 * origin (the PNG export can't include cross-origin images). Defaults to the
 * top quantum coin by market cap.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  let mint = url.searchParams.get("mint");
  if (!mint) {
    const top = await fetch(new URL("/api/launches?kind=quantum&sort=mcap", url.origin)).then((r) => r.json()).catch(() => null);
    mint = top?.launches?.[0]?.mint ?? null;
  }
  if (!isPubkey(mint)) return bad("No coin");
  const data = await fetch(new URL(`/api/token/${mint}?range=1D`, url.origin)).then((r) => r.json()).catch(() => null);
  if (!data || data.error) return bad(data?.error ?? "Coin unavailable", 404);
  return Response.json({ ...data, image: proxiedImage(thumb(data.launch.image_url, 192)) });
}
