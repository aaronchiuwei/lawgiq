import type { Metadata } from "next";
import { FrontPageClient } from "@/components/front-page/client-view";
import { FrontPageFirm } from "@/components/front-page/firm-view";
import { FrontPageProvider } from "@/components/front-page/provider-view";
import { FrontShell } from "@/components/front-page/shell";
import { getClientView, getFirmView, getProviderView, listProviders } from "@/lib/server/case";
import { one, parseRole, type OptionSearchParams } from "@/lib/server/route-helpers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lawgiq" };

/**
 * Server component: resolves the role, asks lib/access for ONLY that role's
 * view, and hands it to the client tree. Nothing else crosses the wire.
 */
export default async function Home({ searchParams }: { searchParams: OptionSearchParams }) {
  const sp = await searchParams;
  const role = parseRole(sp.role);
  const providers = await listProviders();

  if (role === "provider") {
    const view = await getProviderView(one(sp.provider));
    return (
      <FrontShell role={role} providerId={view?.provider.id} providers={providers} freshness={view?.freshness}>
        {view ? <FrontPageProvider view={view} /> : <p className="p-10">No provider found.</p>}
      </FrontShell>
    );
  }
  if (role === "client") {
    const view = await getClientView();
    return (
      <FrontShell role={role} providers={providers} freshness={view.freshness}>
        <FrontPageClient view={view} />
      </FrontShell>
    );
  }
  const view = await getFirmView({ recordOpen: true });
  return (
    <FrontShell role={role} providers={providers} freshness={view.freshness}>
      <FrontPageFirm view={view} />
    </FrontShell>
  );
}
