import { cookies } from "next/headers";
import { ADMIN_COOKIE, adminToken, passwordMatches } from "@/lib/server/admin";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!passwordMatches(body?.password)) {
    // Flat delay blunts online guessing of a short PIN.
    await new Promise((r) => setTimeout(r, 800));
    return Response.json({ error: "Wrong password" }, { status: 401 });
  }
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
  return Response.json({ ok: true });
}
