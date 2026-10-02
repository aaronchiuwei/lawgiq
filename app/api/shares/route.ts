import { NextResponse } from "next/server";
import { z } from "zod";
import { createShare } from "@/lib/db";
import { DEMO_USER, getProviderView, matterKey } from "@/lib/server/case";

const Body = z.object({ providerId: z.string().min(1) });

/**
 * Snapshots the provider-scoped view (already filtered by lib/access) into
 * the sharing log and returns an open-tracked token.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const view = await getProviderView(parsed.data.providerId);
  if (!view) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const itemCount =
    view.requests.length + view.questions.length + view.feed.length + view.bills.length + view.records.length + (view.attendance.released ? 1 : 0);
  const share = createShare({
    matterKey: matterKey(),
    providerId: view.provider.id,
    providerName: view.provider.name,
    sharedBy: DEMO_USER,
    itemCount,
    payloadJson: JSON.stringify(view),
  });
  return NextResponse.json({ token: share.token, id: share.id });
}
