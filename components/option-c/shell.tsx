"use client";

import { MotionConfig } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FreshnessIndicator, RoleSwitcher, SyncProvider } from "@/components/case/chrome";
import { SourceProvider } from "@/components/case/sources";
import type { Freshness, Role } from "@/lib/access";

/**
 * Command chrome: an instrument-panel top bar. The firm view adds the ⌘K
 * trigger and lens filters into the bar via children of its own.
 */
export function CommandShell({
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
    <MotionConfig reducedMotion="user">
      <SourceProvider>
        <SyncProvider className="opt-c reveal-root min-h-[100dvh] bg-paper text-ink">
          <header className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_oklab,var(--paper)_88%,transparent)] backdrop-blur-xl">
            <div className="mx-auto flex max-w-[110rem] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 sm:px-6">
              <Link href="/" className="flex items-center gap-2 text-[14px] font-semibold tracking-[-0.01em] text-ink">
                <span className="grid size-6 place-items-center rounded-[5px] bg-signal font-[family-name:var(--font-num)] text-[12px] font-medium text-paper">L</span>
                Lawgiq
              </Link>
              {matterLabel ? <span className="hidden truncate text-[13px] text-ink-soft lg:inline">{matterLabel}</span> : null}
              <div className="flex-1" />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <RoleSwitcher role={role} providerId={providerId} providers={providers} />
                {freshness ? <FreshnessIndicator freshness={freshness} readOnly={role !== "firm"} /> : null}
              </div>
            </div>
          </header>
          <main id="main" className="sync-dim">
            {children}
          </main>
        </SyncProvider>
      </SourceProvider>
    </MotionConfig>
  );
}
