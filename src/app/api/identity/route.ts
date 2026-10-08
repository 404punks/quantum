import { db, type IdentityRow } from "@/lib/server/supabase";
import { bad, isPubkey } from "@/lib/server/validate";

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet");
  if (!isPubkey(wallet)) return bad("Invalid wallet");

  const { data } = await db.from("pqc_identities").select("*").eq("wallet", wallet).maybeSingle<IdentityRow>();
  if (!data) return Response.json({ identity: null, nextLeaf: 0, leaves: [], schemeKeys: [] });

  const [{ data: leaves }, { data: schemeKeys }] = await Promise.all([
    db.from("pqc_leaves").select("leaf_index, purpose, ref, used_at").eq("identity_id", data.id).order("leaf_index", { ascending: true }),
    db.from("pqc_scheme_keys").select("scheme, public_key, binding").eq("identity_id", data.id),
  ]);
  const used = leaves ?? [];
  const nextLeaf = used.length ? used[used.length - 1].leaf_index + 1 : 0;
  return Response.json({ identity: data, nextLeaf, leaves: used, schemeKeys: schemeKeys ?? [] });
}
