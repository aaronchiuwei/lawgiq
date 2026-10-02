import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedProviderPage } from "@/components/case/shared-provider";
import type { ProviderView } from "@/lib/access";
import { openShare } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Case status", robots: { index: false } };

/**
 * What a provider opens from a shared link. Records the open in our sharing
 * log, then renders the snapshot exactly as the attorney released it. The
 * payload was built by lib/access when it was shared; nothing else is read.
 */
export default async function SharedLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = openShare(token);
  if (!share) notFound();
  const view = JSON.parse(share.payload_json) as ProviderView;
  return <SharedProviderPage view={view} sharedAt={share.created_at} token={token} />;
}
