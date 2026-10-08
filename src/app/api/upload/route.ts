import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, pinImage } from "@/lib/server/pinata";
import { bad } from "@/lib/server/validate";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return bad("No file");
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return bad("Use PNG, JPEG, WEBP or GIF");
  if (file.size > MAX_IMAGE_BYTES) return bad("Image must be under 5 MB");
  try {
    return Response.json({ url: await pinImage(file) });
  } catch (err) {
    return bad(err instanceof Error ? err.message : "Upload failed", 502);
  }
}
