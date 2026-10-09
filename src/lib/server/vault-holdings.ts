import "server-only";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, unpackAccount, unpackMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID as VAULT_PROGRAM_ID } from "@/lib/vault/constants";
import { cached } from "./cache";
import { connection } from "./solana";

export type VaultHoldings = {
  address: string;
  /** Tokens of this coin the vault holds right now (UI units). */
  tokens: number;
  /** Share of total supply. */
  pctSupply: number;
  /** The vault has spent (it's a tombstone now): its remainder rolled into the owner's next vault. */
  spent: boolean;
};

/** A quantum launch's dev vault: what it holds of the coin, read live from chain (cached 30s). */
export function vaultHoldings(mint: string, vault: string): Promise<VaultHoldings | null> {
  return cached(`vault:holdings:${mint}:${vault}`, 30_000, async () => {
    const mintKey = new PublicKey(mint);
    const vaultKey = new PublicKey(vault);
    const ata = getAssociatedTokenAddressSync(mintKey, vaultKey, true, TOKEN_2022_PROGRAM_ID);
    const [mintInfo, ataInfo, vaultInfo] = await connection.getMultipleAccountsInfo([mintKey, ata, vaultKey], "confirmed");
    if (!mintInfo) return null;
    const m = unpackMint(mintKey, mintInfo, mintInfo.owner);
    const raw = ataInfo ? unpackAccount(ata, ataInfo, ataInfo.owner).amount : 0n;
    const supply = Number(m.supply) || 1;
    return {
      address: vault,
      tokens: Number(raw) / 10 ** m.decimals,
      pctSupply: (Number(raw) / supply) * 100,
      spent: Boolean(vaultInfo?.owner.equals(VAULT_PROGRAM_ID)),
    };
  });
}
