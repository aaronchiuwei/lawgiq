import { NextResponse } from "next/server";
import { z } from "zod";
import { setPreviousOpen } from "@/lib/db";
import { DEMO_USER, matterKey } from "@/lib/server/case";

const Body = z.object({ daysAgo: z.number().int().min(0).max(3650).nullable() });

/** Demo control: pretend the attorney last opened the matter N days ago. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const iso = parsed.data.daysAgo === null ? null : new Date(Date.now() - parsed.data.daysAgo * 86_400_000).toISOString();
  setPreviousOpen(DEMO_USER, matterKey(), iso);
  return NextResponse.json({ ok: true, previousOpenedAt: iso });
}
