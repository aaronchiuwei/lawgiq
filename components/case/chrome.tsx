"use client";

import { ArrowsClockwiseIcon, CaretDownIcon, WarningIcon } from "@phosphor-icons/react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import type { Freshness as FreshnessData, Role } from "@/lib/access";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNow } from "./use-now";

/* ---------------------------------------------------------------- sync -- */

type SyncState = { syncing: boolean; error: string | null; sync: () => Promise<void> };
const SyncCtx = createContext<SyncState>({ syncing: false, error: null, sync: async () => {} });
export const useSync = () => useContext(SyncCtx);

/**
 * Owns "sync now". While a sync runs, the option root gets data-syncing so
 * sections can fade to a skeleton state, then content returns on refresh.
 */
export function SyncProvider({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || body.error) setError(body.error ?? `Sync failed (${res.status})`);
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't reach the server. Showing the last synced data.");
    } finally {
      // Let the refreshed content land before lifting the skeleton.
      setTimeout(() => setSyncing(false), 350);
    }
  }

  return (
    <SyncCtx.Provider value={{ syncing, error, sync }}>
      <div className={className} data-syncing={syncing || undefined}>
        {children}
      </div>
    </SyncCtx.Provider>
  );
}

export function FreshnessIndicator({
  freshness,
  className,
  compact,
  readOnly,
}: {
  freshness: { fetchedAt: string } & Partial<FreshnessData>;
  className?: string;
  compact?: boolean;
  /** Provider and client views: show recency, no sync control. */
  readOnly?: boolean;
}) {
  const { syncing, error, sync } = useSync();
  const now = useNow();

  const failed = error ?? freshness.syncError?.message ?? null;
  const when = now ? ago(freshness.fetchedAt, now) : "";
  const label = readOnly ? `Updated ${when}` : syncing ? "Syncing with Clio…" : failed ? `Sync failed · data from ${when}` : `Last synced ${when}`;

  return (
    <div className={cn("flex items-center gap-2 text-[12.5px]", className)} aria-live="polite">
      <span
        aria-hidden
        className={cn("size-2 rounded-full", syncing ? "sync-pulse bg-signal" : failed ? "bg-caution" : "bg-good")}
      />
      <span className={cn("tnum", failed && !syncing ? "text-caution" : "text-ink-soft")} title={failed ?? undefined}>
        {compact && !failed && !syncing ? when : label}
      </span>
      {readOnly ? null : <button
        type="button"
        onClick={sync}
        disabled={syncing}
        aria-label="Sync now with Clio"
        className="grid size-7 place-items-center rounded-full text-ink-soft transition-[color,transform] duration-150 hover:bg-paper-2 hover:text-ink active:scale-[0.94] disabled:opacity-50"
      >
        {failed && !syncing ? <WarningIcon size={15} /> : <ArrowsClockwiseIcon size={15} className={cn(syncing && "animate-spin [animation-duration:1.1s]")} />}
      </button>}
    </div>
  );
}

/* --------------------------------------------------------------- roles -- */

export function RoleSwitcher({
  role,
  providerId,
  providers,
  className,
  tone = "default",
}: {
  role: Role;
  providerId?: string;
  providers: { id: string; shortName: string }[];
  className?: string;
  tone?: "default" | "inverse";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const go = (r: Role, p?: string) => {
    const q = new URLSearchParams();
    if (r !== "firm") q.set("role", r);
    if (r === "provider") q.set("provider", p ?? providerId ?? providers[0]?.id ?? "");
    startTransition(() => router.push(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false }));
  };

  const seg = (r: Role, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={role === r}
      onClick={() => go(r)}
      className={cn(
        "relative h-8 rounded-full px-3.5 text-[13px] font-medium transition-[background-color,color] duration-200",
        role === r ? "bg-ink text-paper" : "text-ink-soft hover:text-ink",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} data-pending={pending || undefined}>
      <div role="radiogroup" aria-label="View as" className={cn("flex items-center gap-0.5 rounded-full border border-line p-0.5", tone === "inverse" ? "bg-paper" : "bg-card-bg")}>
        {seg("firm", "Firm")}
        {seg("provider", "Provider")}
        {seg("client", "Client")}
      </div>
      {role === "provider" ? (
        <label className="relative flex items-center">
          <span className="sr-only">Provider</span>
          <select
            value={providerId}
            onChange={(e) => go("provider", e.target.value)}
            className="h-8 appearance-none rounded-full border border-line bg-card-bg pl-3 pr-8 text-[13px] text-ink"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.shortName}
              </option>
            ))}
          </select>
          <CaretDownIcon size={13} className="pointer-events-none absolute right-3 text-ink-soft" aria-hidden />
        </label>
      ) : null}
      {pending ? (
        <span className="sync-pulse text-[12px] text-ink-soft" aria-live="polite">
          Loading view…
        </span>
      ) : null}
    </div>
  );
}
