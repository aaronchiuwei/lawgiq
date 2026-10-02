"use client";

import { CheckIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { SourceChip, useSources } from "@/components/case/sources";
import type { CaseFile, RankedEvent } from "@/lib/derive";
import { capitalize, daysBetween, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useFront } from "./state";

/**
 * The case spine: the whole file from incident to today on one axis.
 * Three lanes (liability, medical, legal and money); every record is a faint
 * tick, the ten ranked moments are sized by score, and the markers that
 * matter (limitations date, today, the open question) are drawn in. Hover or
 * arrow through the moments; the caption underneath tells each one.
 */

type Lane = { id: "liability" | "medical" | "legal"; label: string; color: string };
const LANES: Lane[] = [
  { id: "liability", label: "Liability", color: "var(--exposure)" },
  { id: "medical", label: "Medical", color: "var(--signal)" },
  { id: "legal", label: "Legal & money", color: "var(--ink)" },
];
const laneOf = (e: RankedEvent): Lane["id"] | null =>
  e.category === "liability" ? "liability" : e.category === "medical" || e.category === "damages" ? "medical" : e.category === "legal" || e.category === "coverage" ? "legal" : null;

export function CaseSpine({ c, className }: { c: CaseFile; className?: string }) {
  const { link, setLink } = useFront();
  const { open } = useSources();
  const reasonFor = (e: RankedEvent) => c.digest.reasons?.[e.id] ?? e.reason;

  const start = c.matter.dateOfIncident?.value ?? c.matter.openDate;
  const upcoming = c.deadlines.filter((d) => d.kind !== "treatment" && d.daysUntil >= 0 && d.daysUntil <= 45);
  const lastUpcoming = upcoming.map((d) => d.date).sort().at(-1);
  const end = lastUpcoming && lastUpcoming > c.today ? lastUpcoming : c.today;
  const span = Math.max(1, daysBetween(start, end) * 1.015);
  const pct = (d: string) => Math.min(100, Math.max(0, (daysBetween(start, d) / span) * 100));

  const years: string[] = [];
  for (let y = Number(start.slice(0, 4)) + 1; y <= Number(end.slice(0, 4)); y++) years.push(`${y}-01-01`);

  // File activity per month: the pulse of the file. Quiet months show as quiet.
  const months = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of c.events) if (e.date >= start && e.date <= c.today) m.set(e.date.slice(0, 7), (m.get(e.date.slice(0, 7)) ?? 0) + 1);
    const out: { key: string; n: number }[] = [];
    const d = new Date(`${start.slice(0, 7)}-01T12:00:00Z`);
    while (d.toISOString().slice(0, 7) <= c.today.slice(0, 7)) {
      const k = d.toISOString().slice(0, 7);
      out.push({ key: k, n: m.get(k) ?? 0 });
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return out;
  }, [c.events, start, c.today]);
  const maxMonth = Math.max(1, ...months.map((m) => m.n));

  const top = useMemo(() => [...c.topEvents].sort((a, b) => a.date.localeCompare(b.date)), [c.topEvents]);
  const topIds = new Set(top.map((e) => e.id));
  const minScore = Math.min(...top.map((e) => e.score));
  const maxScore = Math.max(...top.map((e) => e.score));
  const size = (s: number) => 11 + ((s - minScore) / Math.max(0.01, maxScore - minScore)) * 9;

  const openQ = c.treatment.procedures.find((p) => p.status === "recommended" && p.date && p.openForDays !== null) ?? null;
  const defaultId = top.at(-1)?.id ?? null;
  const [activeId, setActiveId] = useState<string | null>(null);
  const shownId = activeId ?? (link?.source === "hover" ? link.events.find((id) => topIds.has(id)) ?? null : null) ?? defaultId;
  const shown = top.find((e) => e.id === shownId) ?? null;
  const btns = useRef<(HTMLButtonElement | null)[]>([]);

  const activate = (e: RankedEvent | null) => {
    setActiveId(e?.id ?? null);
    setLink(e ? { providers: e.providerIds, events: [e.id], source: "hover" } : null);
  };

  const onKey = (ev: KeyboardEvent, i: number) => {
    const next = ev.key === "ArrowRight" ? i + 1 : ev.key === "ArrowLeft" ? i - 1 : ev.key === "Home" ? 0 : ev.key === "End" ? top.length - 1 : null;
    if (next === null) return;
    ev.preventDefault();
    btns.current[Math.max(0, Math.min(top.length - 1, next))]?.focus();
  };

  const minorOn = (lane: Lane["id"]) => c.events.filter((e) => !topIds.has(e.id) && laneOf(e) === lane && e.date >= start && e.date <= end);
  const changes = link?.source === "changes" ? new Set(link.events) : null;

  return (
    <figure className={cn("a2-spine", className)} aria-label={`Case timeline from ${fmtDate(start)} to ${fmtDate(end)}`}>
      <div className="relative grid grid-cols-[5.5rem_minmax(0,1fr)] sm:grid-cols-[7rem_minmax(0,1fr)]">
        {/* Activity */}
        <div className="flex items-end pb-1 text-[11.5px] text-ink-soft">File activity</div>
        <div className="relative h-7" aria-hidden>
          <div className="absolute inset-0 flex items-end gap-px">
            {months.map((m) => (
              <span
                key={m.key}
                data-spine-bar
                title={`${m.key}: ${m.n} record${m.n === 1 ? "" : "s"}`}
                className="min-w-0 flex-1 origin-bottom rounded-t-[1px] bg-ink-soft"
                style={{ height: `${m.n ? 12 + (m.n / maxMonth) * 88 : 4}%`, opacity: m.n ? 0.22 + (m.n / maxMonth) * 0.5 : 0.12 }}
              />
            ))}
          </div>
        </div>

        {/* Lanes */}
        {LANES.map((lane) => (
          <div key={lane.id} className="contents">
            <div className="flex items-center gap-2 border-t border-line text-[12px] leading-tight text-ink sm:text-[12.5px]">
              <span className="size-2 rounded-full" style={{ background: lane.color }} aria-hidden />
              {lane.label}
            </div>
            <div className="relative h-9 border-t border-line">
              <span data-spine-line aria-hidden className="absolute inset-x-0 top-1/2 h-px origin-left bg-line-strong" />
              {minorOn(lane.id).map((e) => (
                <span
                  key={e.id}
                  aria-hidden
                  data-spine-minor
                  className={cn("absolute top-1/2 h-2.5 w-px -translate-y-1/2 transition-opacity duration-200", changes ? (changes.has(e.id) ? "opacity-100" : "opacity-15") : "opacity-50")}
                  style={{ left: `${pct(e.date)}%`, background: lane.color }}
                />
              ))}
              {lane.id === "medical" && openQ ? (
                <span
                  aria-hidden
                  data-spine-open
                  className="absolute top-1/2 h-0 origin-left -translate-y-1/2 border-t-2 border-dashed border-exposure"
                  style={{ left: `${pct(openQ.date!)}%`, width: `${pct(c.today) - pct(openQ.date!)}%` }}
                >
                  <span className="tnum absolute -top-[1.35rem] right-0 whitespace-nowrap rounded-full bg-paper px-1.5 text-[11px] font-medium text-exposure sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
                    <span className="hidden sm:inline">{capitalize(openQ.label)}: open </span>
                    <span className="sm:hidden">Undated surgery, </span>
                    {openQ.openForDays} days
                  </span>
                </span>
              ) : null}
              {lane.id === "legal"
                ? upcoming.map((d) => (
                    <span
                      key={d.id}
                      title={`${fmtDate(d.date)}: ${d.title}`}
                      data-spine-dot
                      className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-dashed border-ink bg-paper"
                      style={{ left: `${pct(d.date)}%` }}
                    />
                  ))
                : null}
              {top.map((e, i) => {
                if (laneOf(e) !== lane.id) return null;
                const s = size(e.score);
                const isShown = shown?.id === e.id;
                const dim = changes ? !changes.has(e.id) : link?.source === "hover" && !link.events.includes(e.id) && !e.providerIds.some((p) => link.providers.includes(p));
                return (
                  <button
                    key={e.id}
                    ref={(el) => {
                      btns.current[i] = el;
                    }}
                    type="button"
                    data-spine-dot
                    aria-label={`${fmtDate(e.date)}: ${e.title}. ${reasonFor(e) ?? ""}`}
                    onPointerEnter={() => activate(e)}
                    onPointerLeave={() => activate(null)}
                    onFocus={() => activate(e)}
                    onBlur={() => activate(null)}
                    onKeyDown={(ev) => onKey(ev, i)}
                    onClick={() => open([e.source, ...e.duplicates])}
                    className="group absolute top-1/2 z-10 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
                    style={{ left: `${pct(e.date)}%` }}
                  >
                    <span
                      className={cn(
                        "block rounded-full ring-[3px] ring-paper transition-[transform,opacity] duration-200 ease-out group-hover:scale-125",
                        isShown && "scale-125",
                        dim && "opacity-25",
                        changes?.has(e.id) && "outline-2 outline-offset-2 outline-signal [outline-style:solid]",
                      )}
                      style={{ width: s, height: s, background: lane.color }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Axis */}
        <div />
        <div className="relative h-6 border-t border-line text-[11.5px] text-ink-soft" aria-hidden>
          <span className="absolute left-0 top-1 hidden whitespace-nowrap sm:inline">Incident</span>
          {years.map((y) => (
            <span key={y} className="tnum absolute top-1 -translate-x-1/2" style={{ left: `${pct(y)}%` }}>
              {y.slice(0, 4)}
            </span>
          ))}
        </div>

        {/* Markers spanning all lanes */}
        <div className="pointer-events-none absolute bottom-6 left-[5.5rem] right-0 top-0 sm:left-[7rem]" aria-hidden>
          {years.map((y) => (
            <span key={y} className="absolute inset-y-0 w-px bg-line" style={{ left: `${pct(y)}%` }} />
          ))}
          {changes && c.changes.since.slice(0, 10) < c.today ? (
            <span className="absolute inset-y-0 border-l border-signal bg-signal-wash/60" style={{ left: `${pct(c.changes.since.slice(0, 10))}%`, width: `${pct(c.today) - pct(c.changes.since.slice(0, 10))}%` }}>
              <span className="absolute -top-2.5 right-1 whitespace-nowrap rounded-full bg-signal px-1.5 py-0.5 text-[10.5px] font-medium text-paper">New</span>
            </span>
          ) : null}
          {c.sol.date && c.sol.date >= start && c.sol.date <= end ? (
            <span className="absolute inset-y-0 border-l border-dashed" style={{ left: `${pct(c.sol.date)}%`, borderColor: c.sol.status === "satisfied" ? "var(--good)" : "var(--exposure)" }}>
              <span
                className={cn(
                  "absolute -top-2.5 left-0 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10.5px] font-medium",
                  c.sol.status === "satisfied" ? "bg-good-wash text-good" : "bg-exposure-wash text-exposure",
                )}
              >
                {c.sol.status === "satisfied" ? <CheckIcon size={10} weight="bold" /> : null}
                SOL
              </span>
            </span>
          ) : null}
          <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-signal" style={{ left: `${pct(c.today)}%` }}>
            <span className="absolute -bottom-[1.4rem] left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-signal">Today</span>
          </span>
        </div>
      </div>

      {/* Caption: the moment under the cursor, or the latest one. */}
      <figcaption className="mt-3 grid grid-cols-[5.5rem_minmax(0,1fr)] items-start sm:grid-cols-[7rem_minmax(0,1fr)]" aria-live="polite">
        <span className="tnum pt-1 text-[12.5px] text-ink-soft">{shown ? fmtDate(shown.date) : ""}</span>
        <div className="relative min-h-[3rem] overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            {shown ? (
              <motion.div
                key={shown.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                className="flex flex-col gap-1"
              >
                <p className="font-[family-name:var(--font-display)] text-[1.2rem] leading-snug text-ink">{shown.title}</p>
                <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-soft">
                  {reasonFor(shown) ? <span className="font-medium text-ink">{reasonFor(shown)}</span> : null}
                  <SourceChip sources={[shown.source, ...shown.duplicates]} />
                  <span className="hidden sm:inline">Use ← → to step through the {top.length} moments</span>
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </figcaption>
    </figure>
  );
}
