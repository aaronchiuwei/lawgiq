import { NextResponse } from "next/server";
import { z } from "zod";
import { setCoverageAmountVisible, setItemVisible } from "@/lib/db";
import { listProviders, matterKey } from "@/lib/server/case";

const Body = z.union([
  z.object({ itemKey: z.string().min(1).max(200), included: z.boolean() }),
  z.object({ showCoverageAmount: z.boolean() }),
]);

/** Attorney toggles what one provider may see. Stored in our DB, never in Clio. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await listProviders()).some((p) => p.id === id)) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  if ("itemKey" in parsed.data) setItemVisible(matterKey(), id, parsed.data.itemKey, parsed.data.included);
  else setCoverageAmountVisible(matterKey(), id, parsed.data.showCoverageAmount);
  return NextResponse.json({ ok: true });
}
