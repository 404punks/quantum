import { bytesToHex } from "@noble/hashes/utils.js";
import { ComputeBudgetProgram, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { getBuyTokenAmountFromSolAmount } from "@pump-fun/pump-sdk";
import BN from "bn.js";
import { launchDigest } from "@/lib/pq/messages";
import { SCHEMES, bindingDigest, isSchemeId, schemeVerify, type SchemeAttestation, type SchemeId } from "@/lib/pq/schemes";
import { verify, type PqSignature } from "@/lib/pq/xmss";
import { isGatewayUrl, pinMetadata } from "@/lib/server/pinata";
import {
  LAMPORTS_PER_SOL,
  connection,
  fetchGlobal,
  onlinePump,
  pumpLookupTable,
  pumpSdk,
} from "@/lib/server/solana";
import { burnLeaf, db, type IdentityRow } from "@/lib/server/supabase";
import { bad, cleanUrl, isHexUpTo, isPubkey, parseSignature, publicKeyOf } from "@/lib/server/validate";

const MAX_DEV_BUY_SOL = 50;

// On-chain creator for every launch: all creator fees accrue to the treasury vault.
// Fixed at mint time. Individual launchers cannot claim; a keeper holding the
// treasury key sweeps with collectCoinCreatorFeeInstructions.
const TREASURY = new PublicKey(process.env.NEXT_PUBLIC_TREASURY!);

/**
 * Builds the create(+buy) transaction for a PQ-attested launch.
 *
 * The mint keypair is derived client-side from the identity's secret seed and
 * leaf index, so the server never holds it: the client signs as mint, then as
 * fee payer. The WOTS attestation is verified here before anything is pinned.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return bad("Invalid body");

  const wallet = body.wallet;
  const mint = body.mint;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 500) : "";
  const image = body.image;
  const devBuySol = Number(body.devBuySol ?? 0);
  const scheme: SchemeId = isSchemeId(body.scheme) ? body.scheme : "wots";

  if (!isPubkey(wallet) || !isPubkey(mint)) return bad("Invalid wallet or mint");
  if (!name || name.length > 32) return bad("Name must be 1–32 characters");
  if (!/^[A-Za-z0-9]{1,10}$/.test(symbol)) return bad("Ticker must be 1–10 letters or digits");
  if (typeof image !== "string" || !isGatewayUrl(image)) return bad("Upload an image first");
  if (!Number.isFinite(devBuySol) || devBuySol < 0 || devBuySol > MAX_DEV_BUY_SOL) return bad("Bad dev buy");

  const { data: identity } = await db
    .from("pqc_identities")
    .select("*")
    .eq("wallet", wallet)
    .maybeSingle<IdentityRow>();
  if (!identity) return bad("Register a post-quantum identity first", 403);

  const { data: existing } = await db.from("pqc_launches").select("mint").eq("mint", mint).maybeSingle();
  if (existing) return bad("Mint already used", 409);

  // Two attestation shapes: a WOTS one-time signature (burns a leaf), or a
  // many-time NIST scheme signature whose key the WOTS root has certified.
  let digest: Uint8Array;
  let leafIndex: number | null = null;
  let stored: PqSignature | SchemeAttestation;
  if (scheme === "wots") {
    const attestation = parseSignature(body.attestation);
    if (!attestation) return bad("Missing post-quantum attestation");
    digest = launchDigest({ mint, creator: wallet, name, symbol, image, leaf: attestation.leaf });
    if (!verify(digest, attestation, publicKeyOf(identity)).valid) return bad("Attestation does not verify against your identity root");
    const burned = await burnLeaf({ identity_id: identity.id, leaf_index: attestation.leaf, purpose: "launch", message_hash: bytesToHex(digest), ref: mint });
    if (!burned) return bad("That one-time key was already used. Refresh and retry.", 409);
    leafIndex = attestation.leaf;
    stored = attestation;
  } else {
    const info = SCHEMES[scheme];
    const signature = body.attestation?.signature;
    if (!isHexUpTo(signature, info.sigBytes + 64)) return bad("Missing or malformed signature");
    const { data: key } = await db
      .from("pqc_scheme_keys")
      .select("public_key, binding")
      .eq("identity_id", identity.id)
      .eq("scheme", scheme)
      .maybeSingle<{ public_key: string; binding: PqSignature }>();
    if (!key) return bad(`Bind your ${info.name} key to your identity first`, 403);
    // Re-check the certificate chain: root → binding → scheme key → launch.
    const bindOk = verify(bindingDigest({ scheme, publicKey: key.public_key, pqAddress: identity.pq_address }), key.binding, publicKeyOf(identity)).valid;
    if (!bindOk) return bad("Stored scheme binding is invalid", 500);
    digest = launchDigest({ mint, creator: wallet, name, symbol, image, scheme });
    if (!(await schemeVerify(scheme, digest, signature, key.public_key))) return bad(`${info.name} signature does not verify`);
    stored = { scheme, signature, publicKey: key.public_key, binding: key.binding };
  }
  const messageHash = bytesToHex(digest);

  const twitter = cleanUrl(body.twitter);
  // Locked: every coin links back to its attestation page.
  const website = `https://pqc.market/coin/${mint}`;

  const metadata = {
    name,
    symbol,
    ...(description && { description }),
    image,
    showName: true,
    createdOn: "https://pqc.market",
    ...(twitter && { twitter }),
    website,
    pqc: {
      version: 1,
      scheme: scheme === "wots" ? "WOTS(w=16,SHA-256)+Merkle(h=8)" : `${SCHEMES[scheme].name} (${SCHEMES[scheme].standard}), certified by WOTS root`,
      schemeId: scheme,
      pqAddress: identity.pq_address,
      root: identity.root,
      pubSeed: identity.pub_seed,
      height: identity.height,
      messageHash,
      signature: stored,
      verify: `https://pqc.market/coin/${mint}`,
    },
  };

  let uri: string;
  try {
    uri = await pinMetadata(metadata, symbol);
  } catch (err) {
    return bad(err instanceof Error ? err.message : "Metadata pin failed", 502);
  }

  const user = new PublicKey(wallet);
  const mintKey = new PublicKey(mint);
  const lamports = new BN(Math.round(devBuySol * LAMPORTS_PER_SOL));

  const [global, feeConfig] = await Promise.all([fetchGlobal(), onlinePump.fetchFeeConfig().catch(() => null)]);

  const instructions = lamports.isZero()
    ? [await pumpSdk.createV2Instruction({ mint: mintKey, name, symbol, uri, creator: TREASURY, user, mayhemMode: false })]
    : await pumpSdk.createV2AndBuyInstructions({
        global,
        mint: mintKey,
        name,
        symbol,
        uri,
        creator: TREASURY,
        user,
        amount: getBuyTokenAmountFromSolAmount({
          global,
          feeConfig,
          mintSupply: null,
          bondingCurve: null,
          amount: lamports,
          quoteMint: PublicKey.default,
        }),
        solAmount: lamports,
        mayhemMode: false,
      });

  const [{ blockhash }, alt] = await Promise.all([connection.getLatestBlockhash("confirmed"), pumpLookupTable()]);
  const message = new TransactionMessage({
    payerKey: user,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }),
      ...instructions,
    ],
  }).compileToV0Message([alt]);

  const { error } = await db.from("pqc_launches").insert({
    mint,
    name,
    symbol,
    description: description || null,
    image_url: image,
    metadata_uri: uri,
    twitter,
    website,
    creator: wallet,
    identity_id: identity.id,
    pq_address: identity.pq_address,
    leaf_index: leafIndex,
    scheme,
    message_hash: messageHash,
    attestation: stored,
    dev_buy_sol: devBuySol,
    status: "pending",
  });
  if (error) return bad(error.message, 500);

  return Response.json({
    mint,
    uri,
    transaction: Buffer.from(new VersionedTransaction(message).serialize()).toString("base64"),
  });
}
