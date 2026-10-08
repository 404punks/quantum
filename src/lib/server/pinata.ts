import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cached } from "./cache";

const PIN_FILE = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PIN_JSON = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

async function pin(url: string, body: BodyInit, headers: HeadersInit = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PINATA_JWT}`, ...headers },
    body,
  });
  if (!res.ok) throw new Error(`Pinata ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { IpfsHash: string }).IpfsHash;
}

const gateway = (cid: string) => `https://${process.env.NEXT_PUBLIC_PINATA_GATEWAY}/ipfs/${cid}`;

export async function pinImage(file: File) {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("pinataMetadata", JSON.stringify({ name: `pqc-img-${Date.now()}` }));
  return gateway(await pin(PIN_FILE, form));
}

export async function pinMetadata(metadata: object, name: string) {
  const cid = await pin(
    PIN_JSON,
    JSON.stringify({ pinataContent: metadata, pinataMetadata: { name: `pqc-meta-${name}` } }),
    { "Content-Type": "application/json" },
  );
  return gateway(cid);
}

export function isGatewayUrl(url: string) {
  return url.startsWith(`https://${process.env.NEXT_PUBLIC_PINATA_GATEWAY}/ipfs/`);
}

/** public/logo.png pinned once; the gateway URL is cached for a month. */
export async function pinnedLogo() {
  return cached("pinata:logo-url", 30 * 24 * 3600_000, async () => {
    const bytes = await readFile(join(process.cwd(), "public", "logo.png"));
    return pinImage(new File([bytes], "pqc-logo.png", { type: "image/png" }));
  });
}
