import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cached } from "./cache";
import { db } from "./supabase";

const PIN_FILE = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PIN_JSON = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const DEFAULT_GATEWAY = "gateway.pinata.cloud";
const BUCKET = "coin-images";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Shown to the browser. Never include Pinata's body — it echoes the bad token. */
export const UPLOAD_FAILED = "Could not upload the image.";

function clean(value: string | undefined) {
  return (value ?? "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/^Bearer\s+/i, "")
    .replace(/\s+/g, "");
}

/** JWT when it has three segments; otherwise the legacy API key headers. */
function pinataHeaders(): Record<string, string> | null {
  const jwt = clean(process.env.PINATA_JWT);
  if (jwt.split(".").length === 3) return { Authorization: `Bearer ${jwt}` };

  const secret = clean(process.env.PINATA_API_SECRET || process.env.PINATA_SECRET_API_KEY);
  const key = clean(process.env.PINATA_API_KEY) || (jwt && !jwt.includes(".") ? jwt : "");
  if (key && secret) return { pinata_api_key: key, pinata_secret_api_key: secret };

  const splitAt = jwt.indexOf(":");
  if (splitAt > 0) {
    const k = jwt.slice(0, splitAt);
    const s = jwt.slice(splitAt + 1);
    if (k && s) return { pinata_api_key: k, pinata_secret_api_key: s };
  }
  return null;
}

function gatewayHost() {
  const raw = clean(process.env.NEXT_PUBLIC_PINATA_GATEWAY);
  if (!raw) return DEFAULT_GATEWAY;
  try {
    return new URL(/^https?:/.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    return DEFAULT_GATEWAY;
  }
}

const gateway = (cid: string) => `https://${gatewayHost()}/ipfs/${cid}`;

class PinAuthError extends Error {
  constructor() {
    super("pinata-auth");
  }
}

async function pin(url: string, body: BodyInit, headers: HeadersInit = {}) {
  const auth = pinataHeaders();
  if (!auth) throw new PinAuthError();
  const res = await fetch(url, { method: "POST", headers: { ...auth, ...headers }, body });
  if (res.status === 401 || res.status === 403) {
    await res.body?.cancel();
    throw new PinAuthError();
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(UPLOAD_FAILED);
  }
  return ((await res.json()) as { IpfsHash: string }).IpfsHash;
}

function extFor(contentType: string) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  if (contentType === "application/json") return "json";
  return "bin";
}

async function ensureBucket() {
  const existing = await db.storage.getBucket(BUCKET);
  if (!existing.error) return;
  const created = await db.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_IMAGE_BYTES });
  if (created.error && !/already exists/i.test(created.error.message)) throw new Error(created.error.message);
}

/** Public Supabase object URL. Used when Pinata credentials are missing or rejected. */
function toBlob(bytes: Uint8Array, contentType: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: contentType });
}

async function storePublic(bytes: Uint8Array, contentType: string) {
  await ensureBucket();
  const path = `${crypto.randomUUID()}.${extFor(contentType)}`;
  const uploaded = await db.storage.from(BUCKET).upload(path, toBlob(bytes, contentType), {
    contentType,
    upsert: false,
    cacheControl: "31536000",
  });
  if (uploaded.error) throw new Error(uploaded.error.message);
  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  if (!data.publicUrl.startsWith("https://")) throw new Error(UPLOAD_FAILED);
  return data.publicUrl;
}

async function pinOrStore(pinUrl: string | null, body: BodyInit | null, headers: HeadersInit, bytes: Uint8Array, contentType: string) {
  if (pinUrl && body && pinataHeaders()) {
    try {
      return gateway(await pin(pinUrl, body, headers));
    } catch {
      // A bad or rejected Pinata token must not block the upload.
    }
  }
  try {
    return await storePublic(bytes, contentType);
  } catch {
    throw new Error(UPLOAD_FAILED);
  }
}

export async function pinImage(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const form = new FormData();
  form.append("file", toBlob(bytes, file.type), `coin.${extFor(file.type)}`);
  form.append("pinataMetadata", JSON.stringify({ name: `coin-img-${Date.now()}` }));
  return pinOrStore(PIN_FILE, form, {}, bytes, file.type || "application/octet-stream");
}

export async function pinMetadata(metadata: object, name: string) {
  const json = JSON.stringify({ pinataContent: metadata, pinataMetadata: { name: `coin-meta-${name}` } });
  const bytes = new TextEncoder().encode(json);
  return pinOrStore(PIN_JSON, json, { "Content-Type": "application/json" }, bytes, "application/json");
}

export function isGatewayUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = gatewayHost();
    if ((u.hostname === host || u.hostname === DEFAULT_GATEWAY) && u.pathname.startsWith("/ipfs/")) return true;
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    if (!supabaseUrl.startsWith("https://")) return false;
    const base = new URL(supabaseUrl);
    return u.origin === base.origin && u.pathname.startsWith(`/storage/v1/object/public/${BUCKET}/`);
  } catch {
    return false;
  }
}

/** public/logo.png pinned once; the URL is cached for a month. */
export async function pinnedLogo() {
  return cached("pinata:logo-url", 30 * 24 * 3600_000, async () => {
    const bytes = await readFile(join(process.cwd(), "public", "logo.png"));
    return pinImage(new File([bytes], "logo.png", { type: "image/png" }));
  });
}
