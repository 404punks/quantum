import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type AddressLookupTableAccount,
  type TransactionInstruction,
} from "@solana/web3.js";
import { getBuyTokenAmountFromSolAmount } from "@pump-fun/pump-sdk";
import BN from "bn.js";
import { launchDigest } from "@/lib/pq/messages";
import { SCHEMES, bindingDigest, isSchemeId, schemeVerify, type SchemeAttestation, type SchemeId } from "@/lib/pq/schemes";
import { verify, type PqSignature } from "@/lib/pq/xmss";
import { vaultAddress } from "@/lib/vault/vault";
import { quoteSolTo, swapInstructions, type SwapQuote } from "@/lib/server/jupiter";
import { checkPair, isSolQuote, resolvePumpPair, type QuoteToken } from "@/lib/server/quotes";
import { lookupTableFor, lookupTablesEnabled, pairStaticKeys } from "@/lib/server/lookup";
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
import { bad, cleanUrl, isHex32, isHexUpTo, isPubkey, parseSignature, publicKeyOf } from "@/lib/server/validate";

const MAX_DEV_BUY_SOL = 50;
const PUMP_DECIMALS = 6;

// On-chain creator for every launch: all creator fees accrue to the treasury vault.
// Fixed at mint time. Individual launchers cannot claim; a keeper holding the
// treasury key sweeps with collectCoinCreatorFeeInstructions.
function treasury() {
  const value = process.env.NEXT_PUBLIC_TREASURY?.trim();
  if (!value) throw new Error("NEXT_PUBLIC_TREASURY is required");
  return new PublicKey(value);
}

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

  // Quantum launch: the dev buy is delivered into a pqc-vault. The vault is
  // given with the key hash it commits to, so we can prove it is a real vault
  // PDA (spendable only by a WOTS signature) before recording the claim.
  let devVault: PublicKey | null = null;
  if (body.vault != null) {
    if (!isPubkey(body.vault) || !isHex32(body.vaultHash)) return bad("Invalid vault");
    if (vaultAddress(hexToBytes(body.vaultHash))[0].toBase58() !== body.vault) return bad("That address is not a quantum vault");
    if (!(devBuySol > 0)) return bad("A quantum launch needs a dev buy to put in the vault");
    devVault = new PublicKey(body.vault);
  }

  // Pair: SOL (default) or any quote pump.fun accepts. A dev buy on a token pair
  // is paid in SOL and swapped through Jupiter inside the launch.
  const quoteMint = typeof body.quoteMint === "string" && !isSolQuote(body.quoteMint) ? body.quoteMint : null;
  let pair: QuoteToken | null = null;
  let swapQuote: SwapQuote | null = null;
  if (quoteMint) {
    if (!isPubkey(quoteMint)) return bad("Invalid pair");
    const check = await checkPair(quoteMint).catch(() => null);
    if (!check?.ok) return bad(check?.reason ?? "pump.fun doesn't accept that token as a pair");
    pair = check.token;
    // A pump.fun-coin pair needs its curve and pool accounts; with a dev buy into a vault
    // the launch no longer fits one transaction. Refuse before any key is spent.
    if (devVault && pair.category === "pump" && devBuySol > 0 && !lookupTablesEnabled()) {
      return bad(`A quantum launch can't pair with a pump.fun coin like ${pair.symbol} (the transaction is too large). Use a standard launch, or pair with SOL or a listed token.`);
    }
    if (devBuySol > 0) {
      try {
        swapQuote = await quoteSolTo(quoteMint, BigInt(Math.round(devBuySol * LAMPORTS_PER_SOL)));
      } catch (err) {
        return bad(err instanceof Error ? err.message : `Can't swap SOL to ${pair.symbol} right now`, 502);
      }
    }
  }

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
  const page = `https://pqc.market/coin/${devVault ? "q/" : ""}${mint}`;
  const website = page;

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
      verify: page,
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

  let tokenAmount = new BN(0);
  let instructions: TransactionInstruction[];
  let pairBuild: ((mint: PublicKey, user: PublicKey) => Promise<TransactionInstruction[]>) | null = null;
  let swap: { instructions: TransactionInstruction[]; tables: AddressLookupTableAccount[] } | null = null;

  if (pair) {
    // Token pair. The dev buy spends exactly the swap's guaranteed minimum output,
    // so it can never ask for more of the token than the swap delivered.
    const quotePk = new PublicKey(pair.mint);
    const quoteTokenProgram = new PublicKey(pair.tokenProgram);
    const quoteControl = await onlinePump.fetchQuoteControl().catch(() => null);
    // A pump.fun coin off the list seeds the new curve from its live price; resolve it fresh.
    const pumpQuote = pair.category === "pump" ? await resolvePumpPair(pair.mint).catch(() => null) : null;
    if (pair.category === "pump" && !pumpQuote) return bad("pump.fun won't accept that coin as a pair right now");
    if (swapQuote) {
      try {
        swap = await swapInstructions(swapQuote, user);
      } catch (err) {
        return bad(err instanceof Error ? err.message : "Jupiter swap build failed", 502);
      }
      const quoteIn = new BN(swapQuote.otherAmountThreshold);
      tokenAmount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: quoteIn, quoteMint: quotePk, quoteControl, pumpQuote: pumpQuote?.curve });
      const amount = tokenAmount;
      pairBuild = (m, u) =>
        pumpSdk.createV2AndBuyV2Instructions({
          global,
          mint: m,
          name,
          symbol,
          uri,
          creator: treasury(),
          user: u,
          amount,
          quoteAmount: quoteIn,
          mayhemMode: false,
          quoteMint: quotePk,
          quoteTokenProgram,
          pumpQuote: pumpQuote?.accounts,
        });
    } else {
      pairBuild = async (m, u) => [
        await pumpSdk.createV2Instruction({ mint: m, name, symbol, uri, creator: treasury(), user: u, mayhemMode: false, quoteMint: quotePk, quoteTokenProgram, pumpQuote: pumpQuote?.accounts }),
      ];
    }
    instructions = await pairBuild(mintKey, user);
  } else if (lamports.isZero()) {
    instructions = [await pumpSdk.createV2Instruction({ mint: mintKey, name, symbol, uri, creator: treasury(), user, mayhemMode: false })];
  } else {
    tokenAmount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: lamports, quoteMint: PublicKey.default });
    instructions = await pumpSdk.createV2AndBuyInstructions({
      global,
      mint: mintKey,
      name,
      symbol,
      uri,
      creator: treasury(),
      user,
      amount: tokenAmount,
      solAmount: lamports,
      mayhemMode: false,
    });
  }

  // The buy delivers exactly tokenAmount to the creator's account; in the same
  // transaction it moves on to the vault and the emptied account is closed
  // (rent back to the creator). The tokens never rest under an ed25519 key.
  if (devVault) {
    const userAta = getAssociatedTokenAddressSync(mintKey, user, true, TOKEN_2022_PROGRAM_ID);
    const vaultAta = getAssociatedTokenAddressSync(mintKey, devVault, true, TOKEN_2022_PROGRAM_ID);
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(user, vaultAta, devVault, mintKey, TOKEN_2022_PROGRAM_ID),
      createTransferCheckedInstruction(userAta, mintKey, vaultAta, user, BigInt(tokenAmount.toString()), PUMP_DECIMALS, [], TOKEN_2022_PROGRAM_ID),
      createCloseAccountInstruction(userAta, user, user, [], TOKEN_2022_PROGRAM_ID),
    );
  }

  const [{ blockhash }, alt] = await Promise.all([connection.getLatestBlockhash("confirmed"), pumpLookupTable()]);
  const build = (ixs: TransactionInstruction[], units: number, tables: AddressLookupTableAccount[]) => {
    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: user,
        recentBlockhash: blockhash,
        instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }), ...ixs],
      }).compileToV0Message(tables),
    );
    try {
      return tx.serialize().length <= 1232 ? tx : null;
    } catch {
      return null; // over the packet limit
    }
  };

  // Token pairs are heavy (~500k CU for create + buy_v2). Prefer one atomic
  // transaction (swap + create + buy: all or nothing); fall back to swap first,
  // then the launch, when the route is too big to share a packet.
  const units = pair ? (swap ? 1_000_000 : 400_000) : 300_000;
  const assemble = (launchTables: AddressLookupTableAccount[]): VersionedTransaction[] | null => {
    const single = build([...(swap?.instructions ?? []), ...instructions], units, [...launchTables, ...(swap?.tables ?? [])]);
    if (single) return [single];
    if (!swap) return null;
    const swapTx = build(swap.instructions, 400_000, swap.tables);
    const launchTx = build(instructions, 600_000, launchTables);
    return swapTx && launchTx ? [swapTx, launchTx] : null;
  };

  let transactions = assemble([alt]);
  // Too big (e.g. a pump.fun-coin pair plus a quantum-vault dev buy): put this
  // pair's own accounts in our lookup table, once per pair, and try again.
  // Launches that already fit never touch the table.
  if (!transactions && pairBuild && lookupTablesEnabled()) {
    try {
      const table = await lookupTableFor(await pairStaticKeys(pairBuild));
      if (table) transactions = assemble([alt, table]);
    } catch (err) {
      console.warn("lookup table:", err instanceof Error ? err.message : err);
    }
  }
  if (!transactions) {
    return bad(devVault ? `Pairing with ${pair?.symbol ?? "this token"} and a quantum vault together doesn't fit in one Solana transaction. Use a standard launch for this pair.` : "Transaction too large", 400);
  }

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
    dev_vault: devVault?.toBase58() ?? null,
    quote_mint: pair?.mint ?? null,
    quote_symbol: pair?.symbol ?? null,
    quote_image: pair?.image ?? null,
    status: "pending",
  });
  if (error) return bad(error.message, 500);

  // The last transaction is the launch (the mint keypair signs it); any before it is the swap.
  return Response.json({
    mint,
    uri,
    transactions: transactions.map((tx) => Buffer.from(tx.serialize()).toString("base64")),
    swap: swapQuote && pair ? { symbol: pair.symbol, minOut: Number(swapQuote.otherAmountThreshold) / 10 ** pair.decimals, atomic: transactions.length === 1 } : null,
  });
}
