/**
 * Conformance: runs the pqc-vault vectors through the vendored client AND the
 * app's own WOTS code (src/lib/pq/wots.ts, leaf 0). All three implementations
 * (Rust program, client, app) must agree byte for byte.
 *
 *   pnpm dlx tsx scripts/check-vault-vectors.ts
 */
import { readFileSync } from "node:fs";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils.js";
import { Keypair, PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from "@solana/web3.js";
import * as app from "../src/lib/pq/wots";
import { PROGRAM_ID, VaultKey, bufferAddress, deriveVaultSeeds, planSpend, spendDigest, vaultAddress, wots } from "../src/lib/vault";

const dir = new URL("./vault-vectors/", import.meta.url);
const W = JSON.parse(readFileSync(new URL("wots.json", dir), "utf8"));
const V = JSON.parse(readFileSync(new URL("vault.json", dir), "utf8"));

let failures = 0;
function eq(what: string, got: Uint8Array | string | number, want: string | number) {
  const g = got instanceof Uint8Array ? bytesToHex(got) : got;
  if (g !== want) {
    failures++;
    console.error(`FAIL ${what}\n  got  ${String(g).slice(0, 80)}\n  want ${String(want).slice(0, 80)}`);
  }
}

// --- app WOTS, at leaf 0, in the vault's public-key layout (pubSeed ‖ pk_0 ‖ … ‖ pk_66) ---
const appPublicKey = (sk: Uint8Array, ps: Uint8Array) => concatBytes(ps, ...app.publicKey(sk, ps, 0));
const appSign = (sk: Uint8Array, ps: Uint8Array, d: Uint8Array) => concatBytes(...app.sign(d, sk, ps, 0));

for (const c of W.cases) {
  const sk = hexToBytes(c.skSeed);
  const ps = hexToBytes(c.pubSeed);
  const d = hexToBytes(c.digest);
  for (const [impl, pk, sig, steps, sk0] of [
    ["client", wots.publicKey(sk, ps), wots.sign(sk, ps, d), [...wots.digestToSteps(d)], wots.secretElement(sk, 0)],
    ["app", appPublicKey(sk, ps), appSign(sk, ps, d), app.digits(d), app.secretElement(sk, 0, 0)],
  ] as const) {
    eq(`${c.name} ${impl} sk0`, sk0, c.sk0);
    eq(`${c.name} ${impl} publicKey`, pk, c.publicKey);
    eq(`${c.name} ${impl} publicKeyHash`, sha256(pk), c.publicKeyHash);
    eq(`${c.name} ${impl} signature`, sig, c.signature);
    eq(`${c.name} ${impl} steps`, JSON.stringify(steps), JSON.stringify(c.steps));
  }
  eq(`${c.name} verifySteps`, wots.verifySteps(d), c.verifySteps);
  // Recover from the vector's signature with the app's verifier.
  const sigChunks = Array.from({ length: 67 }, (_, i) => hexToBytes(c.signature).subarray(i * 32, (i + 1) * 32));
  eq(`${c.name} app recover`, sha256(concatBytes(ps, ...app.publicKeyFromSignature(d, sigChunks, ps, 0))), c.publicKeyHash);
  eq(`${c.name} client recover`, wots.recoverPublicKeyHash(ps, hexToBytes(c.signature), d), c.publicKeyHash);
}

// --- vault derivation, addresses, digests, payloads ---
eq("programId", PROGRAM_ID.toBase58(), V.programId);
const identity = { skSeed: hexToBytes(V.identity.skSeed), pubSeed: hexToBytes(V.identity.pubSeed) };
for (const v of V.vaults) {
  const seeds = deriveVaultSeeds(identity, v.index);
  eq(`vault[${v.index}] skSeed`, seeds.skSeed, v.skSeed);
  eq(`vault[${v.index}] pubSeed`, seeds.pubSeed, v.pubSeed);
  const key = VaultKey.fromIdentity(identity, v.index);
  eq(`vault[${v.index}] pkHash`, key.pkHash, v.pkHash);
  eq(`vault[${v.index}] app pkHash`, sha256(appPublicKey(seeds.skSeed, seeds.pubSeed)), v.pkHash);
  eq(`vault[${v.index}] address`, key.address.toBase58(), v.address);
  eq(`vault[${v.index}] bump`, key.bump, v.bump);
}

for (const [name, s] of [["solSpend", V.solSpend], ["tokenSpend", V.tokenSpend]] as const) {
  const p = {
    vault: new PublicKey(s.vault),
    recipient: new PublicKey(s.recipient),
    mint: s.mint ? new PublicKey(s.mint) : null,
    amount: BigInt(s.amount),
    nextVaultHash: hexToBytes(s.nextVaultHash),
  };
  const digest = spendDigest(p);
  eq(`${name} digest`, digest, s.digest);
  eq(`${name} nextVault`, vaultAddress(p.nextVaultHash)[0].toBase58(), s.nextVault);
  eq(`${name} buffer`, bufferAddress(p.vault, digest, new PublicKey(s.bufferPayer))[0].toBase58(), s.buffer);
  const index = V.vaults.find((v: { address: string }) => v.address === s.vault).index;
  const key = VaultKey.fromIdentity(identity, index);
  const { payload } = key.signSpend({ recipient: p.recipient, mint: p.mint, amount: p.amount, nextVaultHash: p.nextVaultHash });
  eq(`${name} payload`, payload, s.payload);
  const seeds = deriveVaultSeeds(identity, index);
  eq(`${name} app payload`, concatBytes(seeds.pubSeed, appSign(seeds.skSeed, seeds.pubSeed, digest)), s.payload);
}

// --- every transaction the app builds fits in a packet, with our priority-fee instruction ---
{
  const key = VaultKey.fromIdentity(identity, 0);
  const next = VaultKey.fromIdentity(identity, 1);
  const payer = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  for (const token of [null, { mint, tokenProgram: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb") }]) {
    const plan = planSpend({ from: key, nextVaultHash: next.pkHash, recipient: payer.publicKey, amount: BigInt(1), payer: payer.publicKey, token });
    for (const ixs of [...plan.writeInstructions, plan.withdrawInstructions]) {
      const msg = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: PublicKey.default.toBase58(),
        instructions: [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }), ...ixs],
      }).compileToV0Message();
      const size = new VersionedTransaction(msg).serialize().length;
      if (size > 1232) {
        failures++;
        console.error(`FAIL transaction size ${size} > 1232`);
      }
    }
  }
}

if (failures) {
  console.error(`\n${failures} mismatch(es)`);
  process.exit(1);
}
console.log(`ok: ${W.cases.length} WOTS cases x 2 implementations, ${V.vaults.length} vaults, 2 spends, tx sizes`);
