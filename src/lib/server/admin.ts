import "server-only";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "pqc_admin";

/** Opaque session token: changes if either the password or the platform seed rotates. */
export function adminToken() {
  return bytesToHex(sha256(utf8ToBytes(`pqc.market/admin/v1:${process.env.ADMIN_PASSWORD}:${process.env.PQC_PLATFORM_SEED}`)));
}

export function passwordMatches(password: unknown) {
  return typeof password === "string" && password.length > 0 && password === process.env.ADMIN_PASSWORD;
}

export async function isAdmin() {
  const jar = await cookies();
  return jar.get(ADMIN_COOKIE)?.value === adminToken();
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
