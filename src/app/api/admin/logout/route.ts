import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/lib/server/admin";

export async function POST() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  return Response.json({ ok: true });
}
