import { bad } from "@/lib/server/validate";
import { relayVaultTransaction } from "@/lib/server/vault";

/** Relays one wallet-signed vault transaction (deposit, signature chunk, withdraw, sweep). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.transaction !== "string" || body.transaction.length > 4_000) return bad("Invalid body");
  try {
    return Response.json(await relayVaultTransaction(Buffer.from(body.transaction, "base64")));
  } catch (err) {
    const e = err as Error & { code?: number | null; signature?: string };
    return Response.json({ error: e.message, code: e.code ?? null, signature: e.signature ?? null }, { status: 502 });
  }
}
