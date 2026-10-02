"use client";

import { PlayIcon } from "@phosphor-icons/react";
import { MotionConfig, motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FreshnessIndicator, RoleSwitcher, SyncProvider } from "@/components/case/chrome";
import { SourceProvider } from "@/components/case/sources";
import type { Freshness, Role } from "@/lib/access";
import { cn } from "@/lib/utils";
import { DEPTHS, FrontPageState, useFrontMaybe } from "./state";
import { ThemeToggle } from "./theme-toggle";

/**
 * Front Page chrome: a sticky folio line. On the firm view it carries the
 * depth dial (Glance / Brief / Full) and the "since you were here" switch.
 * Every role gets the light / dark toggle.
 */
export function FrontShell({
  role,
  providerId,
  providers,
  freshness,
  changeIds = [],
  children,
}: {
  role: Role;
  providerId?: string;
  providers: { id: string; shortName: string }[];
  freshness?: { fetchedAt: string } & Partial<Freshness>;
  changeIds?: string[];
  children: ReactNode;
}) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", duration: 0.45, bounce: 0.12 }}>
      <SourceProvider>
        <FrontPageState changeIds={changeIds}>
          <SyncProvider className="opt-a opt-a2 reveal-root min-h-[100dvh] bg-paper text-ink">
            <a href="#main" className="skip-link">
              Skip to the case
            </a>
            <header className="a2-masthead sticky top-0 z-40 border-b border-line bg-[color-mix(in_oklab,var(--paper)_86%,transparent)] backdrop-blur-xl">
              <div className="mx-auto flex h-14 max-w-[84rem] items-center gap-x-5 px-4 sm:px-8">
                <Link href="/" className="font-[family-name:var(--font-display)] text-[19px] font-semibold tracking-[-0.01em] text-ink">
                  Lawgiq
                </Link>
                <div className="flex-1" />
                {role === "firm" ? <FirmControls /> : null}
                <RoleSwitcher role={role} providerId={providerId} providers={providers} className="hidden md:flex" />
                {freshness ? <FreshnessIndicator freshness={freshness} readOnly={role !== "firm"} className="hidden lg:flex" /> : null}
                <ThemeToggle />
              </div>
              <div className="mx-auto flex max-w-[84rem] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pb-2 sm:px-8 lg:hidden">
                <RoleSwitcher role={role} providerId={providerId} providers={providers} className="md:hidden" />
                {freshness ? <FreshnessIndicator freshness={freshness} readOnly={role !== "firm"} compact className="sm:hidden" /> : null}
                {freshness ? <FreshnessIndicator freshness={freshness} readOnly={role !== "firm"} className="hidden sm:flex" /> : null}
              </div>
              {/* The firm view docks its section nav here once the front page scrolls away. */}
              <div id="a2-dock" />
            </header>
            <main id="main" className="sync-dim">
              {children}
            </main>
          </SyncProvider>
        </FrontPageState>
      </SourceProvider>
    </MotionConfig>
  );
}

function FirmControls() {
  const front = useFrontMaybe();
  if (!front) return null;
  const { depth, setDepth, changesOn, toggleChanges, changeIds, setBriefing } = front;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setBriefing(true)}
        title="A 30-second guided read of the case (press b)"
        className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-card-bg px-3 text-[13px] font-medium text-ink transition-[border-color,transform] duration-150 hover:border-ink active:scale-[0.97]"
      >
        <PlayIcon size={12} weight="fill" aria-hidden />
        <span className="hidden sm:inline">Brief me</span>
      </button>
      <div role="radiogroup" aria-label="Reading depth" className="relative flex items-center gap-0.5 rounded-full border border-line bg-card-bg p-0.5">
        {DEPTHS.map((d) => {
          const on = depth === d.value;
          return (
            <button
              key={d.value}
              type="button"
              role="radio"
              aria-checked={on}
              title={`${d.hint} (press ${d.value})`}
              onClick={() => setDepth(d.value)}
              className={cn("relative h-8 rounded-full px-3 text-[13px] font-medium transition-colors duration-200", on ? "text-paper" : "text-ink-soft hover:text-ink")}
            >
              {on ? <motion.span layoutId="a2-depth-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} /> : null}
              <span className="relative flex items-center gap-1.5">
                <DepthGlyph depth={d.value} />
                <span className="hidden sm:inline">{d.label}</span>
              </span>
            </button>
          );
        })}
      </div>
      {changeIds.size ? (
        <button
          type="button"
          aria-pressed={changesOn}
          onClick={toggleChanges}
          title="Light up everything new since your last visit (press n)"
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.97]",
            changesOn ? "border-signal bg-signal text-paper" : "border-line bg-card-bg text-ink hover:border-signal",
          )}
        >
          <span className={cn("tnum grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11.5px]", changesOn ? "bg-paper text-signal" : "bg-signal-wash text-signal")}>{changeIds.size}</span>
          <span className="hidden sm:inline">new</span>
        </button>
      ) : null}
    </div>
  );
}

/** Three stacked rules: one, two or three lines of detail. */
function DepthGlyph({ depth }: { depth: number }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0">
      <rect x="1" y="1.5" width="10" height="1.6" rx="0.8" fill="currentColor" />
      <rect x="1" y="5.2" width={depth >= 2 ? 10 : 6} height="1.6" rx="0.8" fill="currentColor" opacity={depth >= 2 ? 1 : 0.3} />
      <rect x="1" y="8.9" width={depth >= 3 ? 10 : 4} height="1.6" rx="0.8" fill="currentColor" opacity={depth >= 3 ? 1 : 0.3} />
    </svg>
  );
}
