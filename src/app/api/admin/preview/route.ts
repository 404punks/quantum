import { isAdmin, unauthorized } from "@/lib/server/admin";
import { ImportError, resolveImport } from "@/lib/server/import";
import { pinnedLogo } from "@/lib/server/pinata";
import { bad, isPubkey } from "@/lib/server/validate";

export async function POST(request: Request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!isPubkey(body?.mint)) return bad("Invalid contract address");
  try {
    const [preview, image] = await Promise.all([resolveImport(body.mint), pinnedLogo()]);
    return Response.json({ preview: { ...preview, image } });
  } catch (err) {
    if (err instanceof ImportError) return bad(err.message, err.status);
    return bad(err instanceof Error ? err.message : "Lookup failed", 502);
  }
}
