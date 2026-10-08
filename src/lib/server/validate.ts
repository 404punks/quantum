import "server-only";
import { PublicKey } from "@solana/web3.js";
import { LEN, N } from "@/lib/pq/wots";
import { TREE_HEIGHT, type PqSignature } from "@/lib/pq/xmss";
import type { IdentityRow } from "./supabase";

export function isPubkey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

const HEX32 = /^[0-9a-f]{64}$/;

export function parseSignature(value: unknown): PqSignature | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>;
  if (!Number.isInteger(s.leaf) || (s.leaf as number) < 0 || (s.leaf as number) >= 1 << TREE_HEIGHT) return null;
  if (typeof s.wots !== "string" || !new RegExp(`^[0-9a-f]{${LEN * N * 2}}$`).test(s.wots)) return null;
  if (!Array.isArray(s.auth) || s.auth.length !== TREE_HEIGHT) return null;
  if (!s.auth.every((x) => typeof x === "string" && HEX32.test(x))) return null;
  return { leaf: s.leaf as number, wots: s.wots, auth: s.auth as string[] };
}

export function isHex32(value: unknown): value is string {
  return typeof value === "string" && HEX32.test(value);
}

export function publicKeyOf(row: Pick<IdentityRow, "root" | "pub_seed" | "height">) {
  return { root: row.root, pubSeed: row.pub_seed, height: row.height };
}

export function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function cleanUrl(value: unknown, prefix?: string) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    if (prefix && !url.href.startsWith(prefix)) return null;
    return url.href.slice(0, 200);
  } catch {
    return null;
  }
}

const HEX = /^[0-9a-f]+$/;

/** Hex string of bounded length (scheme signatures and public keys). */
export function isHexUpTo(value: unknown, maxBytes: number): value is string {
  return typeof value === "string" && value.length % 2 === 0 && value.length <= maxBytes * 2 && value.length > 0 && HEX.test(value);
}
