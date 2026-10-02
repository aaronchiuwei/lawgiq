"use client";

import type { CaseFile } from "@/lib/derive";
import { daysBetween, fmtDate, fmtMonth, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SourceChip } from "./sources";

/**
 * Shared visualisations, drawn from tokens so each option restyles them.
 * Animatable parts carry data attributes (data-bar, data-gap, data-point)
 * so each option can choreograph them with its own motion library.
 */

const HATCH = (color: string) =>
  `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px 7px)`;

/* ------------------------------------------------------ value vs cover -- */

export function CoverageGauge({ c, className, showLegend = true }: { c: CaseFile; className?: string; showLegend?: boolean }) {
  const value = c.kpis.estimatedValue?.value ?? null;
  const limit = c.kpis.coverage.defendantLimit?.value ?? null;
  if (value === null || limit === null) {
    return <p className={cn("text-[13px] text-ink-soft", className)}>Value or policy limit missing in Clio, so coverage can&apos;t be compared.</p>;
  }
  const max = Math.max(value, limit);
  const covered = Math.min(limit, value) / max;
  const over = value > limit;
  return (
    <figure className={cn("coverage-gauge", className)} aria-label={`Estimated value ${fmtUsd(value)} against a ${fmtUsd(limit)} per-person limit`}>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-paper-2">
        <div data-bar className="absolute inset-y-0 left-0 origin-left rounded-full bg-ink" style={{ width: `${covered * 100}%` }} />
        {over ? (
          <div
            data-gap
            className="absolute inset-y-0 right-0 origin-left"
            style={{ left: `${covered * 100}%`, backgroundImage: HATCH("var(--exposure)"), backgroundColor: "var(--exposure-wash)" }}
          />
        ) : null}
      </div>
      {showLegend ? (
        <figcaption className="mt-2 flex justify-between gap-3 text-[12px] text-ink-soft">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-ink" aria-hidden /> Covered up to {fmtUsd(limit, { compact: true })}
          </span>
          {over ? (
            <span className="flex items-center gap-1.5 text-exposure">
              <span className="size-2 rounded-full" style={{ backgroundImage: HATCH("var(--exposure)") }} aria-hidden /> {fmtUsd(value - limit, { compact: true })} above it
            </span>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

/* -------------------------------------------------------------- specials -- */

export function SpecialsBars({ c, className, compact }: { c: CaseFile; className?: string; compact?: boolean }) {
  const s = c.specials;
  if (!s) return <p className="text-[14px] text-ink-soft">No itemised specials tally found in the file notes.</p>;
  const max = Math.max(...s.lines.map((l) => l.amount));
  const providerName = (id: string | null) => c.providers.find((p) => p.id === id)?.shortName;
  return (
    <div className={cn("specials-bars", className)}>
      <ul className={cn("flex flex-col", compact ? "gap-2" : "gap-3")}>
        {s.lines.map((l) => {
          const uncertain = s.uncertainLabels.includes(l.label);
          return (
            <li key={l.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1">
              <span className="min-w-0 truncate text-[13.5px] text-ink">
                {providerName(l.providerId) ?? l.label}
                <span className="text-ink-soft"> · {providerName(l.providerId) ? l.label : l.detail}</span>
              </span>
              <span className="tnum text-[13.5px] text-ink">{fmtUsd(l.amount)}</span>
              <div className="col-span-2 h-2 rounded-full bg-paper-2">
                <div
                  data-bar
                  className="h-full origin-left rounded-full"
                  style={{
                    width: `${(l.amount / max) * 100}%`,
                    background: uncertain ? undefined : "var(--signal)",
                    backgroundImage: uncertain ? HATCH("var(--caution)") : undefined,
                    backgroundColor: uncertain ? "var(--caution-wash)" : undefined,
                  }}
                  title={uncertain ? "Ledger not yet reconciled against CPT lines" : undefined}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full" style={{ backgroundImage: HATCH("var(--caution)"), backgroundColor: "var(--caution-wash)" }} aria-hidden />
          Unreconciled ledger
        </span>
        {s.coverage ? (
          <span>
            Bills in from {s.coverage.reported} of {s.coverage.of} providers
          </span>
        ) : null}
        <SourceChip sources={s.source} label={`Tally ${fmtDate(s.asOf)}`} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------- treatment ribbon -- */

export function TreatmentRibbon({ c, className, providerIds }: { c: CaseFile; className?: string; providerIds?: string[] }) {
  const start = c.treatment.dateOfIncident ?? c.matter.openDate;
  const scheduled = c.treatment.providers.flatMap((p) => p.points.filter((pt) => pt.kind === "scheduled").map((pt) => pt.date));
  const end = [c.today, ...scheduled].sort().at(-1)!;
  const span = Math.max(1, daysBetween(start, end));
  const x = (d: string) => `${Math.min(100, Math.max(0, (daysBetween(start, d) / span) * 100))}%`;
  const years: string[] = [];
  for (let y = Number(start.slice(0, 4)) + 1; y <= Number(end.slice(0, 4)); y++) years.push(`${y}-01-01`);
  const rows = c.treatment.providers.filter((p) => !providerIds || providerIds.includes(p.providerId));

  return (
    <div className={cn("treatment-ribbon", className)}>
      <div className="relative ml-[var(--ribbon-label,9.5rem)] h-5 text-[11.5px] text-ink-soft" aria-hidden>
        {years.map((y) => (
          <span key={y} className="tnum absolute -translate-x-1/2" style={{ left: x(y) }}>
            {y.slice(0, 4)}
          </span>
        ))}
        <span className="absolute -translate-x-full pr-1 text-signal" style={{ left: x(c.today) }}>
          Today
        </span>
      </div>
      <ul className="flex flex-col">
        {rows.map((row) => {
          const p = c.providers.find((pp) => pp.id === row.providerId)!;
          return (
            <li key={row.providerId} className="grid grid-cols-[var(--ribbon-label,9.5rem)_minmax(0,1fr)] items-center border-t border-line py-2.5 first:border-t-0">
              <div className="pr-3">
                <p className="truncate text-[13.5px] text-ink" title={p.name}>
                  {p.shortName}
                </p>
                <p className="truncate text-[12px] text-ink-soft">{p.specialty}</p>
              </div>
              <div className="relative h-7" role="img" aria-label={`${p.shortName}: ${row.points.length} dated records of care, ${row.gaps.length} gaps over ${c.thresholds.treatmentGapDays} days${row.nextScheduled ? `, next visit ${fmtDate(row.nextScheduled)}` : ""}`}>
                <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
                {years.map((y) => (
                  <div key={y} className="absolute inset-y-1 w-px bg-line" style={{ left: x(y) }} />
                ))}
                {row.gaps.map((g) => (
                  <div
                    key={`${g.from}-${g.to}`}
                    data-gap
                    title={`No dated record of care for ${g.days} days (${fmtDate(g.from)} to ${fmtDate(g.to)})`}
                    className="absolute top-1/2 h-2.5 origin-left -translate-y-1/2 rounded-[2px]"
                    style={{ left: x(g.from), width: `calc(${x(g.to)} - ${x(g.from)})`, backgroundImage: HATCH("var(--caution)"), backgroundColor: "var(--caution-wash)" }}
                  />
                ))}
                {row.points.map((pt, i) => (
                  <span
                    key={`${pt.date}-${i}`}
                    data-point
                    title={`${fmtDate(pt.date)}: ${pt.label}`}
                    className={cn(
                      "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                      pt.kind === "visit" && "bg-ink",
                      pt.kind === "records" && "bg-signal",
                      pt.kind === "report" && "border-[1.5px] border-ink bg-card-bg",
                      pt.kind === "scheduled" && "border-[1.5px] border-dashed border-signal bg-card-bg",
                    )}
                    style={{ left: x(pt.date) }}
                  />
                ))}
                <span className="absolute inset-y-0 w-px bg-signal" style={{ left: x(c.today) }} aria-hidden />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 pl-[var(--ribbon-label,9.5rem)] text-[12px] text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-ink" aria-hidden />Visit on calendar</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-signal" aria-hidden />In produced records</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-[1.5px] border-ink" aria-hidden />Attendance reported</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-[1.5px] border-dashed border-signal" aria-hidden />Scheduled</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-[2px]" style={{ backgroundImage: HATCH("var(--caution)"), backgroundColor: "var(--caution-wash)" }} aria-hidden />
          Gap over {c.thresholds.treatmentGapDays} days
        </span>
      </div>
    </div>
  );
}

/** Small stage track (Intake → Closed). Labels: only the current stage by default. */
export function StageTrack({ stages, current, className, labels = "current" }: { stages: string[]; current: string | null; className?: string; labels?: "current" | "all" | false | true }) {
  const idx = current ? stages.indexOf(current) : -1;
  const mode = labels === true ? "current" : labels;
  return (
    <ol className={cn("stage-track flex w-full items-start gap-1", className)} aria-label={`Stage ${idx + 1} of ${stages.length}: ${current ?? "unknown"}`}>
      {stages.map((s, i) => (
        <li key={s} title={s} className="flex min-w-0 flex-1 flex-col gap-1.5" aria-current={i === idx ? "step" : undefined}>
          <span className={cn("h-1 rounded-full", i < idx ? "bg-ink" : i === idx ? "bg-signal" : "bg-[color-mix(in_oklab,var(--ink-soft)_55%,transparent)]")} data-stage-seg />
          {mode === "all" ? (
            <span className={cn("text-[11.5px] leading-tight [overflow-wrap:anywhere]", i === idx ? "font-medium text-ink" : "text-ink-soft")}>{s}</span>
          ) : mode === "current" && i === idx ? (
            <span className="whitespace-nowrap text-[12px] font-medium text-ink">
              {s} <span className="font-normal text-ink-soft">· {i + 1} of {stages.length}</span>
            </span>
          ) : (
            <span className="sr-only">{s}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

export { HATCH, fmtMonth };

/** One provider's attendance as a strip (provider view: their own data only). */
export function AttendanceStrip({
  points,
  gaps,
  today,
  className,
  legend,
}: {
  points: { date: string; kind: "visit" | "records" | "scheduled" | "report"; label: string }[];
  gaps: { from: string; to: string; days: number }[];
  today: string;
  className?: string;
  legend?: boolean;
}) {
  if (!points.length) return <p className={cn("text-[13.5px] text-ink-soft", className)}>No dated visits for this provider on the firm&apos;s file.</p>;
  const start = points[0].date;
  const end = [today, ...points.map((p) => p.date)].sort().at(-1)!;
  const span = Math.max(1, daysBetween(start, end));
  const x = (d: string) => `${Math.min(100, Math.max(0, (daysBetween(start, d) / span) * 100))}%`;
  return (
    <div className={cn("attendance-strip", className)}>
      <div className="relative h-8" role="img" aria-label={`${points.length} dated points of care, ${gaps.length} gaps`}>
        <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
        {gaps.map((g) => (
          <div
            key={`${g.from}-${g.to}`}
            data-gap
            title={`${g.days} days without a dated record (${fmtDate(g.from)} to ${fmtDate(g.to)})`}
            className="absolute top-1/2 h-2.5 origin-left -translate-y-1/2 rounded-[2px]"
            style={{ left: x(g.from), width: `calc(${x(g.to)} - ${x(g.from)})`, backgroundImage: HATCH("var(--caution)"), backgroundColor: "var(--caution-wash)" }}
          />
        ))}
        {points.map((pt, i) => (
          <span
            key={`${pt.date}-${i}`}
            data-point
            title={`${fmtDate(pt.date)}: ${pt.label}`}
            className={cn(
              "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
              pt.kind === "visit" && "bg-ink",
              pt.kind === "records" && "bg-signal",
              pt.kind === "report" && "border-[1.5px] border-ink bg-card-bg",
              pt.kind === "scheduled" && "border-[1.5px] border-dashed border-signal bg-card-bg",
            )}
            style={{ left: x(pt.date) }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[11.5px] text-ink-soft">
        <span className="tnum">{fmtMonth(start)}</span>
        <span className="tnum">{fmtMonth(end)}</span>
      </div>
      {legend ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-soft">
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-ink" aria-hidden />Visit</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-signal" aria-hidden />Your records</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full border border-ink" aria-hidden />Reported to the firm</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full border border-dashed border-signal" aria-hidden />Scheduled</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-3.5 rounded-[2px]" style={{ backgroundImage: HATCH("var(--caution)"), backgroundColor: "var(--caution-wash)" }} aria-hidden />
            No record
          </span>
        </div>
      ) : null}
    </div>
  );
}
