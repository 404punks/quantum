import { hexToBytes } from "@noble/hashes/utils.js";
import { PublicKey } from "@solana/web3.js";
import { bytesToHex, spendDigest, vaultAddress } from "@/lib/vault";
import { db } from "@/lib/server/supabase";
import { bad, isHex32, isPubkey } from "@/lib/server/validate";

const COLUMNS =
  "tag, vault, vault_index, next_vault, next_vault_hash, recipient, mint, token_program, amount_raw, digest, mac, status, write_txs, withdraw_tx, cleanup_txs, created_at, updated_at";

/** Spend records by tag. Tags are secrets only the identity owner can compute, so this lists only their own. */
export async function GET(request: Request) {
  const tags = (new URL(request.url).searchParams.get("tags") ?? "").split(",").filter(isHex32).slice(0, 64);
  if (!tags.length) return Response.json({ spends: [] });
  const { data, error } = await db.from("pqc_vault_spends").select(COLUMNS).in("tag", tags).order("vault_index", { ascending: false });
  if (error) return bad(error.message, 500);
  return Response.json({ spends: data ?? [] });
}

/**
 * Records a signed spend before any of it is broadcast. One row per tag (= per
 * vault, per owner): a second, different spend of the same vault is refused and
 * the caller gets the original back to replay.
 */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null);
  if (!b) return bad("Invalid body");
  if (![b.wallet, b.vault, b.nextVault, b.recipient].every(isPubkey)) return bad("Invalid address");
  if (b.mint != null && !isPubkey(b.mint)) return bad("Invalid mint");
  if (b.tokenProgram != null && !isPubkey(b.tokenProgram)) return bad("Invalid token program");
  if ((b.mint == null) !== (b.tokenProgram == null)) return bad("Mint and token program go together");
  if (![b.nextVaultHash, b.digest, b.tag, b.mac].every(isHex32)) return bad("Invalid hash");
  const index = Number(b.index);
  if (!Number.isInteger(index) || index < 0 || index > 1_000_000) return bad("Invalid index");
  if (typeof b.amount !== "string" || !/^\d{1,20}$/.test(b.amount) || BigInt(b.amount) > BigInt("18446744073709551615")) return bad("Invalid amount");

  // The digest must be exactly what the program will rebuild from these parameters.
  const digest = spendDigest({
    vault: new PublicKey(b.vault),
    recipient: new PublicKey(b.recipient),
    mint: b.mint ? new PublicKey(b.mint) : null,
    amount: BigInt(b.amount),
    nextVaultHash: hexToBytes(b.nextVaultHash),
  });
  if (bytesToHex(digest) !== b.digest) return bad("Digest does not match the spend parameters");
  if (vaultAddress(hexToBytes(b.nextVaultHash))[0].toBase58() !== b.nextVault) return bad("Next vault does not match its hash");

  const { data, error } = await db
    .from("pqc_vault_spends")
    .insert({
      tag: b.tag,
      wallet: b.wallet,
      vault: b.vault,
      vault_index: index,
      next_vault: b.nextVault,
      next_vault_hash: b.nextVaultHash,
      recipient: b.recipient,
      mint: b.mint ?? null,
      token_program: b.tokenProgram ?? null,
      amount_raw: b.amount,
      digest: b.digest,
      mac: b.mac,
    })
    .select(COLUMNS)
    .single();
  if (error?.code === "23505") {
    const { data: existing } = await db.from("pqc_vault_spends").select(COLUMNS).eq("tag", b.tag).single();
    return Response.json({ spend: existing, existing: true }, { status: 409 });
  }
  if (error) return bad(error.message, 500);
  return Response.json({ spend: data, existing: false });
}
