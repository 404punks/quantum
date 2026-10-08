import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service-role client. Server routes only; bypasses RLS for writes. */
export const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

export type IdentityRow = {
  id: string;
  wallet: string;
  pq_address: string;
  root: string;
  pub_seed: string;
  height: number;
  passphrase_hardened: boolean;
  ed_signature: string;
  genesis: unknown;
  anchor_tx: string | null;
  anchored_at: string | null;
  created_at: string;
};

export type LaunchRow = {
  mint: string;
  name: string;
  symbol: string;
  description: string | null;
  image_url: string | null;
  metadata_uri: string | null;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  creator: string;
  identity_id: string | null;
  pq_address: string;
  leaf_index: number | null;
  message_hash: string;
  scheme: string;
  attestation: unknown;
  dev_buy_sol: number;
  status: "pending" | "live" | "failed";
  tx_signature: string | null;
  created_at: string;
  launched_at: string | null;
};

export async function nextFreeLeaf(identityId: string) {
  const { data } = await db
    .from("pqc_leaves")
    .select("leaf_index")
    .eq("identity_id", identityId)
    .order("leaf_index", { ascending: false })
    .limit(1);
  return data?.length ? data[0].leaf_index + 1 : 0;
}

/** Burns a leaf. Returns false if it was already used (primary-key conflict). */
export async function burnLeaf(row: {
  identity_id: string;
  leaf_index: number;
  purpose: "genesis" | "launch" | "proof" | "bind" | "transfer";
  message_hash: string;
  ref?: string;
}) {
  const { error } = await db.from("pqc_leaves").insert(row);
  if (error?.code === "23505") return false;
  if (error) throw new Error(error.message);
  return true;
}
