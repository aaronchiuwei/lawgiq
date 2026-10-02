import { NextResponse } from "next/server";
import { z } from "zod";
import { deletePhoto, setPhoto } from "@/lib/db";
import { getCaseContext } from "@/lib/server/case";

const Body = z.object({ dataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/).max(2_000_000) });

/** Client photo lives in our DB: Clio has no photo field and we never write to Clio. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Expected a JPEG, PNG or WebP data URL under 2 MB" }, { status: 400 });
  const { caseFile } = await getCaseContext();
  setPhoto(caseFile.client.id, parsed.data.dataUrl);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const { caseFile } = await getCaseContext();
  deletePhoto(caseFile.client.id);
  return NextResponse.json({ ok: true });
}
