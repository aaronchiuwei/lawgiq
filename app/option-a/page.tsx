import type { Metadata } from "next";
import { BriefingClient } from "@/components/option-a/client-view";
import { BriefingFirm } from "@/components/option-a/firm-view";
import { BriefingProvider } from "@/components/option-a/provider-view";
import { BriefingShell } from "@/components/option-a/shell";
import { getClientView, getFirmView, getProviderView, listProviders } from "@/lib/server/case";
import { one, parseRole, type OptionSearchParams } from "@/lib/server/route-helpers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Briefing · Option A" };

/**
 * Server component: resolves the role, asks lib/access for ONLY that role's
 * view, and hands it to the client tree. Nothing else crosses the wire.
 */
export default async function OptionA({ searchParams }: { searchParams: OptionSearchParams }) {
  const sp = await searchParams;
  const role = parseRole(sp.role);
  const providers = await listProviders();

  if (role === "provider") {
    const view = await getProviderView(one(sp.provider));
    return (
      <BriefingShell role={role} providerId={view?.provider.id} providers={providers} freshness={view?.freshness}>
        {view ? <BriefingProvider view={view} /> : <p className="p-10">No provider found.</p>}
      </BriefingShell>
    );
  }
  if (role === "client") {
    const view = await getClientView();
    return (
      <BriefingShell role={role} providers={providers} freshness={view.freshness}>
        <BriefingClient view={view} />
      </BriefingShell>
    );
  }
  const view = await getFirmView({ recordOpen: true });
  return (
    <BriefingShell role={role} providers={providers} freshness={view.freshness} matterLabel={view.case.matter.description}>
      <BriefingFirm view={view} />
    </BriefingShell>
  );
}
