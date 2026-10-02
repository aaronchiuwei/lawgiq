"use client";

import { HATCH } from "@/components/case/viz";
import type { CaseFile } from "@/lib/derive";
import { fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The money ruler: value against coverage as one shape. The bar is the
 * estimated value; the solid part is what the defendant's per-person limit
 * covers, the hatched part is exposure above it. The lien is carved out of the
 * covered part because it comes off any recovery. Ticks above mark what the
 * file's own numbers add up to (billed specials, specials plus wage loss).
 */
export function MoneyRuler({ c, className, compact }: { c: CaseFile; className?: string; compact?: boolean }) {
  const value = c.kpis.estimatedValue?.value ?? null;
  const limit = c.kpis.coverage.defendantLimit?.value ?? null;
  if (value === null || limit === null) {
    return <p className={cn("text-[13px] text-ink-soft", className)}>Value or policy limit missing in Clio, so coverage can&apos;t be compared.</p>;
  }
  const specials = c.kpis.specials?.value ?? null;
  const wage = c.kpis.wageLoss?.value ?? null;
  const lien = c.kpis.liens.reduce((n, l) => n + (l.amount ?? 0), 0);
  const econ = specials !== null && wage !== null ? specials + wage : null;
  const max = Math.max(value, limit, econ ?? 0) * 1.0;
  const x = (n: number) => `${(n / max) * 100}%`;
  const over = value > limit;
  const lienW = Math.min(lien, limit);
  // Labels near either end align inward so they never leave the bar.
  const align = (n: number) => (n / max > 0.72 ? "end" : n / max < 0.12 ? "start" : "center");

  const ticks = [
    specials !== null ? { at: specials, label: `Billed ${fmtUsd(specials, { compact: true })}`, strong: specials > limit } : null,
    econ !== null && econ !== specials ? { at: econ, label: `+ wage loss ${fmtUsd(econ, { compact: true })}`, strong: false } : null,
  ].filter(Boolean) as { at: number; label: string; strong: boolean }[];

  return (
    <figure className={cn("a2-ruler", className)} aria-label={`Estimated value ${fmtUsd(value)}; defendant limit ${fmtUsd(limit)}; ${over ? `${fmtUsd(value - limit)} above it` : "within it"}`}>
      {/* Ticks: what the file's numbers add up to */}
      <div className="relative h-7" aria-hidden>
        {ticks.map((t) => (
          <span
            key={t.label}
            data-ruler-tick
            className={cn("absolute bottom-0 flex flex-col", align(t.at) === "end" ? "-translate-x-full items-end" : align(t.at) === "start" ? "items-start" : "-translate-x-1/2 items-center")}
            style={{ left: x(t.at) }}
          >
            <span className={cn("tnum whitespace-nowrap text-[11.5px]", t.strong ? "font-medium text-ink" : "text-ink-soft")}>{t.label}</span>
            <span className="mt-0.5 h-2 w-px bg-ink-soft" />
          </span>
        ))}
      </div>
      <div className="relative h-4 w-full overflow-hidden rounded-[3px] bg-paper-2">
        <div data-ruler-cover className="absolute inset-y-0 left-0 origin-left bg-ink" style={{ width: x(Math.min(limit, value)) }} />
        {lienW > 0 ? (
          <div
            data-ruler-lien
            title={`${c.kpis.liens.map((l) => l.holder).join(", ")} lien comes off any recovery`}
            className="absolute inset-y-0 origin-right"
            style={{ left: `calc(${x(Math.min(limit, value))} - ${x(lienW)})`, width: x(lienW), backgroundImage: HATCH("var(--paper)"), backgroundColor: "color-mix(in oklab, var(--ink) 55%, var(--paper))" }}
          />
        ) : null}
        {over ? (
          <div
            data-ruler-gap
            className="absolute inset-y-0 origin-left"
            style={{ left: x(limit), width: `calc(${x(value)} - ${x(limit)})`, backgroundImage: HATCH("var(--exposure)"), backgroundColor: "var(--exposure-wash)" }}
          />
        ) : null}
      </div>
      <figcaption className="relative mt-1.5 h-9 text-[12px] text-ink-soft">
        <span className={cn("absolute left-0 top-0 hidden whitespace-nowrap", !compact && "sm:block")}>
          <span className="block text-ink">Covered</span>
          {lienW > 0 ? <span className="tnum">lien {fmtUsd(lien, { compact: true })} off the top</span> : null}
        </span>
        <span className="absolute top-0 -translate-x-full pr-2 text-right" style={{ left: x(limit) }}>
          <span className="tnum block whitespace-nowrap font-medium text-ink">Limit {fmtUsd(limit, { compact: true })}</span>
          {lienW > 0 ? <span className={cn("tnum block whitespace-nowrap", !compact && "sm:hidden")}>lien {fmtUsd(lien, { compact: true })} off</span> : null}
        </span>
        {over ? (
          <span className="absolute top-0 -translate-x-full whitespace-nowrap text-right" style={{ left: x(value) }}>
            <span className="tnum block font-medium text-exposure">Value {fmtUsd(value, { compact: true })}</span>
            {compact ? null : <span className="tnum">{fmtUsd(value - limit, { compact: true })} exposed</span>}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
