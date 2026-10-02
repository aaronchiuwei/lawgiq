"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { FreshnessIndicator, RoleSwitcher, SyncProvider } from "@/components/case/chrome";
import { SourceProvider } from "@/components/case/sources";
import type { Freshness, Role } from "@/lib/access";

/**
 * Story chrome. The firm view draws its own collapsing header (it is part of
 * the scroll narrative); provider and client views get a floating island bar.
 */
export function StoryShell({
  role,
  providerId,
  providers,
  freshness,
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
      <SyncProvider className="opt-b reveal-root min-h-[100dvh] bg-paper text-ink">
        {role !== "firm" ? (
          <header className="fixed inset-x-0 top-3 z-30 flex justify-center px-3">
            <div className="flex max-w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-[1.4rem] border border-line bg-[color-mix(in_oklab,var(--card-bg)_82%,transparent)] px-3 py-2 shadow-[0_10px_30px_-12px_color-mix(in_oklab,var(--ink)_30%,transparent)] backdrop-blur-xl">
              <Link href="/" className="pl-1 font-[family-name:var(--font-display)] text-[17px] font-bold tracking-[-0.02em] text-ink">
                Lawgiq
              </Link>
              <RoleSwitcher role={role} providerId={providerId} providers={providers} />
              {freshness ? <FreshnessIndicator freshness={freshness} readOnly /> : null}
            </div>
          </header>
        ) : null}
        <main id="main" className="sync-dim">
          {children}
        </main>
      </SyncProvider>
    </SourceProvider>
  );
}
