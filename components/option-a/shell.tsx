"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { FreshnessIndicator, RoleSwitcher, SyncProvider } from "@/components/case/chrome";
import { SourceProvider } from "@/components/case/sources";
import type { Freshness, Role } from "@/lib/access";

/** Briefing chrome: a slim masthead with a hairline, like a newspaper's folio line. */
export function BriefingShell({
  role,
  providerId,
  providers,
  freshness,
  matterLabel,
  children,
}: {
  role: Role;
  providerId?: string;
  providers: { id: string; shortName: string }[];
  freshness?: { fetchedAt: string } & Partial<Freshness>;
  matterLabel?: string;
  children: ReactNode;
}) {
  return (
    <SourceProvider>
      <SyncProvider className="opt-a reveal-root min-h-[100dvh] bg-paper text-ink">
        <header className="mx-auto flex max-w-[78rem] flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line px-4 py-3.5 sm:px-8">
          <div className="flex min-w-0 items-baseline gap-3">
            <Link href="/" className="font-[family-name:var(--font-display)] text-[19px] font-semibold tracking-[-0.01em] text-ink">
              Lawgiq
            </Link>
            {matterLabel ? <span className="hidden truncate text-[13px] text-ink-soft md:inline">{matterLabel}</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <RoleSwitcher role={role} providerId={providerId} providers={providers} />
            {freshness ? <FreshnessIndicator freshness={freshness} readOnly={role !== "firm"} /> : null}
          </div>
        </header>
        <main id="main" className="sync-dim">
          {children}
        </main>
      </SyncProvider>
    </SourceProvider>
  );
}
