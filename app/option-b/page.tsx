import type { Metadata } from "next";
import { StoryClient } from "@/components/option-b/client-view";
import { StoryFirm } from "@/components/option-b/firm-view";
import { StoryProvider } from "@/components/option-b/provider-view";
import { StoryShell } from "@/components/option-b/shell";
import { getClientView, getFirmView, getProviderView, listProviders } from "@/lib/server/case";
import { one, parseRole, type OptionSearchParams } from "@/lib/server/route-helpers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Story · Option B" };

/**
 * Server component: resolves the role, asks lib/access for ONLY that role's
 * view, and hands it to the client tree. Nothing else crosses the wire.
 */
export default async function OptionB({ searchParams }: { searchParams: OptionSearchParams }) {
  const sp = await searchParams;
  const role = parseRole(sp.role);
  const providers = await listProviders();

  if (role === "provider") {
    const view = await getProviderView(one(sp.provider));
    return (
      <StoryShell role={role} providerId={view?.provider.id} providers={providers} freshness={view?.freshness}>
        {view ? <StoryProvider view={view} /> : <p className="p-10">No provider found.</p>}
      </StoryShell>
    );
  }
  if (role === "client") {
    const view = await getClientView();
    return (
      <StoryShell role={role} providers={providers} freshness={view.freshness}>
        <StoryClient view={view} />
      </StoryShell>
    );
  }
  const view = await getFirmView({ recordOpen: true });
  return (
    <StoryShell role={role} providers={providers} freshness={view.freshness} matterLabel={view.case.matter.description}>
      <StoryFirm view={view} providers={providers} />
    </StoryShell>
  );
}
