import { connection } from "@/lib/server/solana";
import { isPubkey } from "@/lib/server/validate";
import { rentFloors } from "@/lib/server/vault";
import { PublicKey } from "@solana/web3.js";

/**
 * Raw accounts (vaults, signature buffers, recipients) plus a fresh blockhash
 * and the rent floors. Never cached: the spend flow polls this until the
 * staged signature is visible.
 */
export async function GET(request: Request) {
  const addresses = [...new Set((new URL(request.url).searchParams.get("addresses") ?? "").split(",").filter(isPubkey))].slice(0, 64);
  try {
    const [infos, latest, rent] = await Promise.all([
      addresses.length ? connection.getMultipleAccountsInfo(addresses.map((a) => new PublicKey(a)), "confirmed") : Promise.resolve([]),
      connection.getLatestBlockhash("confirmed"),
      rentFloors(),
    ]);
    const accounts = Object.fromEntries(
      addresses.map((a, i) => {
        const info = infos[i];
        return [a, info ? { lamports: info.lamports, owner: info.owner.toBase58(), data: Buffer.from(info.data).toString("base64") } : null];
      }),
    );
    return Response.json({ accounts, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight, rent });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "RPC error" }, { status: 502 });
  }
}
