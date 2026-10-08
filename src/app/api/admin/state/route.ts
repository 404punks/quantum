import { isAdmin } from "@/lib/server/admin";
import { platformIdentity } from "@/lib/server/platform";
import { db, nextFreeLeaf } from "@/lib/server/supabase";

export async function GET() {
  if (!(await isAdmin())) return Response.json({ admin: false });

  const { identity } = await platformIdentity();
  const [nextLeaf, { data: imports }] = await Promise.all([
    nextFreeLeaf(identity.id),
    db
      .from("pqc_imports")
      .select("mint, imported_at, pqc_launches(name, symbol, image_url, leaf_index, launched_at)")
      .order("imported_at", { ascending: false })
      .limit(100),
  ]);

  return Response.json({
    admin: true,
    platform: { pqAddress: identity.pq_address, root: identity.root, nextLeaf, capacity: 1 << identity.height },
    imports: imports ?? [],
  });
}
