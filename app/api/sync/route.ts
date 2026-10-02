import { NextResponse } from "next/server";
import { loadBundle } from "@/lib/server/case";

/** Re-reads the matter from Clio (GET only) into our snapshot. */
export async function POST() {
  try {
    const { bundle, syncError } = await loadBundle({ force: true });
    return NextResponse.json({ fetchedAt: bundle.fetchedAt, origin: bundle.origin, error: syncError?.message ?? null });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 502 });
  }
}
