import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Token logos for the pair picker come from all over the internet, and about a
 * quarter live on public IPFS gateways that rate-limit (429) a page loading
 * many at once. They are served through /api/img instead, which tries several
 * gateways, caches the bytes, and only proxies URLs this server signed.
 */

const SECRET = process.env.IMAGE_PROXY_SECRET ?? createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "pqc").update("pqc.market/img/v1").digest("hex");

const sign = (src: string) => createHmac("sha256", SECRET).update(src).digest("hex").slice(0, 32);

export function verify(src: string, sig: string) {
  const expected = Buffer.from(sign(src));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** A proxied, cacheable URL for an external token image (null stays null). */
export function proxiedImage(src: string | null | undefined): string | null {
  if (!src || !/^https?:\/\//i.test(src)) return null;
  return `/api/img?src=${encodeURIComponent(src)}&sig=${sign(src)}`;
}

/** The IPFS content id in a gateway URL, if it is one (path or subdomain style). */
function ipfsPath(src: string): string | null {
  const path = /\/ipfs\/([A-Za-z0-9]{40,}(?:\/[^?#]*)?)/.exec(src);
  if (path) return path[1];
  const sub = /^https?:\/\/([a-z0-9]{40,})\.ipfs\.[^/]+(\/[^?#]*)?/i.exec(src);
  return sub ? sub[1] + (sub[2] && sub[2] !== "/" ? sub[2] : "") : null;
}

const GATEWAYS = ["https://4everland.io/ipfs/", "https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://nftstorage.link/ipfs/"];

/** Every URL worth trying for an image, best first. */
export function candidates(src: string): string[] {
  const p = ipfsPath(src);
  return p ? [...GATEWAYS.map((g) => g + p), src] : [src];
}
