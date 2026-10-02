"use client";

import { FrontPageProvider } from "@/components/front-page/provider-view";
import { ThemeToggle } from "@/components/front-page/theme-toggle";
import type { ProviderView } from "@/lib/access";
import { fmtDate } from "@/lib/format";
import { SourceProvider } from "./sources";

/** Provider-facing page for a shared link: the Front Page provider layout, no firm chrome. */
export function SharedProviderPage({ view, sharedAt }: { view: ProviderView; sharedAt: string }) {
  return (
    <SourceProvider>
      <div className="opt-a opt-a2 reveal-root min-h-[100dvh] bg-paper text-ink">
        <header className="mx-auto flex max-w-[76rem] items-center justify-between gap-4 border-b border-line px-4 py-3 sm:px-8">
          <span className="font-[family-name:var(--font-display)] text-[19px] font-semibold text-ink">Case status</span>
          <span className="flex items-center gap-3">
            <span className="tnum text-[13px] text-ink-soft">Shared {fmtDate(sharedAt)}</span>
            <ThemeToggle />
          </span>
        </header>
        <main id="main">
          <FrontPageProvider view={view} shared />
        </main>
      </div>
    </SourceProvider>
  );
}
