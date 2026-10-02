import type { Metadata } from "next";
import { CommandClient } from "@/components/option-c/client-view";
import { CommandFirm } from "@/components/option-c/firm-view";
import { CommandProvider } from "@/components/option-c/provider-view";
import { CommandShell } from "@/components/option-c/shell";
import { getClientView, getFirmView, getProviderView, listProviders } from "@/lib/server/case";
import { one, parseRole, type OptionSearchParams } from "@/lib/server/route-helpers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Command · Option C" };

/**
 * Server component: resolves the role, asks lib/access for ONLY that role's
 * view, and hands it to the client tree. Nothing else crosses the wire.
 */
export default async function OptionC({ searchParams }: { searchParams: OptionSearchParams }) {
  const sp = await searchParams;
  const role = parseRole(sp.role);
  const providers = await listProviders();

  if (role === "provider") {
    const view = await getProviderView(one(sp.provider));
    return (
      <CommandShell role={role} providerId={view?.provider.id} providers={providers} freshness={view?.freshness}>
        {view ? <CommandProvider view={view} /> : <p className="p-10">No provider found.</p>}
      </CommandShell>
    );
  }
  if (role === "client") {
    const view = await getClientView();
    return (
      <CommandShell role={role} providers={providers} freshness={view.freshness}>
        <CommandClient view={view} />
      </CommandShell>
    );
  }
  const view = await getFirmView({ recordOpen: true });
  return (
    <CommandShell role={role} providers={providers} freshness={view.freshness} matterLabel={view.case.matter.description}>
      <CommandFirm view={view} />
    </CommandShell>
  );
}
