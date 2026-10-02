import { NextResponse } from "next/server";
import { loadBundle } from "@/lib/server/case";

/** Re-runs scripts/export_matter.py (Clio GET only) and re-reads the pipeline output. */
export async function POST() {
  try {
    const { bundle, syncError } = await loadBundle({ force: true });
    return NextResponse.json({ fetchedAt: bundle.fetchedAt, origin: bundle.origin, error: syncError?.message ?? null });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 502 });
  }
}
