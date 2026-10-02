"use client";

import { MinusIcon, PlusIcon, WarningDiamondIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Conflict } from "@/lib/derive";
import { cn } from "@/lib/utils";
import { SourceChip } from "./sources";

/** A visible, adjustable threshold (e.g. "flag after 30 days"). Saved to our DB. */
export function ThresholdStepper({
  setting,
  value,
  label,
  unit = "days",
  min = 1,
  max = 365,
  step = 5,
  className,
}: {
  setting: "clientContactStaleDays" | "treatmentGapDays";
  value: number;
  label: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState(value);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const commit = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    const previous = v;
    setV(clamped);
    setFailed(false);
    startTransition(async () => {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [setting]: clamped }) }).catch(() => null);
      if (!res?.ok) {
        setV(previous);
        setFailed(true);
        return;
      }
      router.refresh();
    });
  };
  return (
    <div className={cn("flex items-center gap-2 text-[12.5px] text-ink-soft", className)} data-pending={pending || undefined}>
      <span>{label}</span>
      <div className="flex items-center rounded-full border border-line">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => commit(v - step)} className="grid size-7 place-items-center rounded-full hover:bg-paper-2 active:scale-[0.94]">
          <MinusIcon size={12} />
        </button>
        <output className="tnum min-w-[4.5ch] text-center text-ink" aria-live="polite">
          {v} {unit === "days" ? "d" : unit}
        </output>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => commit(v + step)} className="grid size-7 place-items-center rounded-full hover:bg-paper-2 active:scale-[0.94]">
          <PlusIcon size={12} />
        </button>
      </div>
      {failed ? (
        <span role="alert" className="text-exposure">
          Not saved
        </span>
      ) : null}
    </div>
  );
}

/** Small "Check this" flag where two records disagree. Shows both sources. */
export function ConflictFlag({ conflict, className, label = "Check this" }: { conflict: Conflict; className?: string; label?: string }) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-full bg-caution-wash px-2 text-[11.5px] font-medium leading-none text-caution transition-transform duration-150 active:scale-[0.97]",
          className,
        )}
      >
        <WarningDiamondIcon size={12} weight="fill" aria-hidden />
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 border border-line bg-card-bg p-4 text-ink shadow-[0_12px_32px_-8px_color-mix(in_oklab,var(--ink)_25%,transparent)] ring-0">
        <p className="text-[13.5px] font-medium">{conflict.title}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{conflict.detail}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {conflict.sources.map((s, i) => (
            <SourceChip key={`${s.id}-${i}`} sources={s} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Demo-only: rewind "last opened" so the what-changed feed has something to show. */
export function LastVisitDemo({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const set = (daysAgo: number | null) =>
    startTransition(async () => {
      await fetch("/api/demo/last-opened", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ daysAgo }) });
      router.refresh();
    });
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-soft", className)} data-pending={pending || undefined}>
      <span>Demo: last opened</span>
      {[7, 14, 30].map((d) => (
        <button key={d} type="button" onClick={() => set(d)} className="rounded-full px-1.5 underline decoration-line-strong underline-offset-2 hover:text-ink">
          {d}d ago
        </button>
      ))}
    </div>
  );
}
