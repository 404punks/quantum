import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

function supabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL?.trim() ?? "";
    if (!url) throw new Error("supabaseUrl is required.");
    client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
      auth: { persistSession: false },
    });
  }
  return client;
}

/** Service-role client. Server routes only; bypasses RLS for writes. Created on first use so route imports survive a build without env. */
export const db: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const real = supabase();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
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
  dev_vault: string | null;
  quote_mint: string | null;
  quote_symbol: string | null;
  quote_image: string | null;
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
