import { NextResponse } from "next/server";
import { z } from "zod";
import { setSetting } from "@/lib/db";

const Body = z.object({
  clientContactStaleDays: z.number().int().min(1).max(365).optional(),
  treatmentGapDays: z.number().int().min(7).max(365).optional(),
});

/** Visible, adjustable thresholds (client-contact flag, treatment gap). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  for (const [k, v] of Object.entries(parsed.data)) if (v !== undefined) setSetting(k, String(v));
  return NextResponse.json({ ok: true });
}
