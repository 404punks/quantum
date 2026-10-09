import { cached } from "@/lib/server/cache";
import { candidates, verify } from "@/lib/server/img";

const MAX_BYTES = 4_000_000;
const WEEK = 7 * 24 * 60 * 60;

type Stored = { type: string; data: string };

/** Image type from the bytes: some hosts (Arweave) send no content-type at all. */
function sniff(buf: Buffer, header: string): string | null {
  if (header.startsWith("image/")) return header;
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.subarray(0, 3).toString() === "GIF") return "image/gif";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (/^\s*(<\?xml|<svg)/i.test(buf.subarray(0, 100).toString())) return "image/svg+xml";
  return null;
}

async function tryOne(url: string, signal: AbortSignal): Promise<Stored> {
  const res = await fetch(url, { cache: "no-store", redirect: "follow", signal });
  if (!res.ok) throw new Error(`${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) throw new Error("size");
  const type = sniff(buf, res.headers.get("content-type")?.split(";")[0] ?? "");
  if (!type) throw new Error("not an image");
  return { type, data: buf.toString("base64") };
}

/** Races every gateway at once; the first real image wins and the rest are cancelled. */
async function fetchImage(src: string): Promise<Stored> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    return await Promise.any(candidates(src).map((url) => tryOne(url, controller.signal)));
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** Signed image proxy for token logos: several IPFS gateways, cached a week in Redis and in browsers. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const src = params.get("src") ?? "";
  const sig = params.get("sig") ?? "";
  if (!src || !verify(src, sig)) return new Response("Forbidden", { status: 403 });
  try {
    const img = await cached(`img:${sig}`, WEEK * 1000, () => fetchImage(src));
    return new Response(Buffer.from(img.data, "base64"), {
      headers: { "Content-Type": img.type, "Cache-Control": `public, max-age=${WEEK}, immutable` },
    });
  } catch {
    // Not cached server-side: the next request races every gateway again.
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
  }
}
