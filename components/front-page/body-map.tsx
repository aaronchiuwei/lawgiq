"use client";

import { CheckCircleIcon, ClockCountdownIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { SourceChip } from "@/components/case/sources";
import type { CaseFile } from "@/lib/derive";
import { spotsFor, type BodySpot } from "@/lib/derive/headlines";
import { capitalize, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Injuries on a schematic figure seen from behind, so the client's left is on
 * the left and the spine is visible. Regions come from the derive layer's
 * anatomical vocabulary; sides come from the procedure labels. A solid ring is
 * a surgery done, a turning dashed ring a surgery recommended and undated.
 */

const AT: Record<BodySpot, [number, number]> = {
  head: [80, 30],
  neck: [80, 58],
  "shoulder-l": [53, 72],
  "shoulder-r": [107, 72],
  "upper-back": [80, 92],
  "lower-back": [80, 142],
  "hip-l": [67, 166],
  "hip-r": [93, 166],
  "wrist-l": [33, 158],
  "wrist-r": [127, 158],
  "knee-l": [67, 236],
  "knee-r": [93, 236],
  "ankle-l": [65, 294],
  "ankle-r": [95, 294],
};

const LIMBS: [number, number, number, number][] = [
  [52, 72, 40, 116],
  [40, 116, 33, 160],
  [108, 72, 120, 116],
  [120, 116, 127, 160],
  [68, 168, 67, 236],
  [67, 236, 65, 300],
  [92, 168, 93, 236],
  [93, 236, 95, 300],
];

export function BodyMap({ c, depth, compact }: { c: CaseFile; depth: 1 | 2 | 3; compact?: boolean }) {
  const [hot, setHot] = useState<string | null>(null);
  const regions = c.treatment.injuries.map((inj) => ({ inj, spots: spotsFor(`${inj.region} ${inj.prose}`) }));
  const procs = c.treatment.procedures.map((p) => ({ p, spots: spotsFor(p.label) }));
  const regionOfSpot = (s: BodySpot) => regions.find((r) => r.spots.includes(s))?.inj.region ?? null;
  const hotSpots = new Set(regions.find((r) => r.inj.region === hot)?.spots ?? []);

  return (
    <div className={cn("grid gap-8", compact ? "sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-5" : "sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-10")}>
      <figure className={cn("mx-auto sm:mx-0", compact ? "w-[7.5rem]" : "w-[10rem]")} aria-label={`Injured regions: ${regions.map((r) => r.inj.region).join(", ")}`}>
        <svg viewBox="0 0 160 320" className="w-full overflow-visible" role="img" aria-hidden>
          <defs>
            <radialGradient id="a2-glow">
              <stop offset="0%" stopColor="var(--exposure)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--exposure)" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Figure: outlined capsules (outer stroke, inner fill stroke). */}
          <g strokeLinecap="round" strokeLinejoin="round" data-body>
            {LIMBS.map(([x1, y1, x2, y2], i) => (
              <line key={`o${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--line-strong)" strokeWidth={i < 4 ? 15 : 19} />
            ))}
            <path d="M50 66 C 62 59, 98 59, 110 66 L 114 84 L 106 138 L 109 170 L 51 170 L 54 138 L 46 84 Z" fill="var(--line-strong)" stroke="var(--line-strong)" strokeWidth="2" />
            <rect x="71" y="46" width="18" height="18" rx="6" fill="var(--line-strong)" />
            <ellipse cx="80" cy="30" rx="18" ry="21" fill="var(--line-strong)" />
            {LIMBS.map(([x1, y1, x2, y2], i) => (
              <line key={`i${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--paper-2)" strokeWidth={i < 4 ? 12 : 16} />
            ))}
            <path d="M50 66 C 62 59, 98 59, 110 66 L 114 84 L 106 138 L 109 170 L 51 170 L 54 138 L 46 84 Z" fill="var(--paper-2)" />
            <rect x="72.5" y="46" width="15" height="18" rx="5" fill="var(--paper-2)" />
            <ellipse cx="80" cy="30" rx="16.5" ry="19.5" fill="var(--paper-2)" />
            {/* Spine */}
            <line x1="80" y1="52" x2="80" y2="164" stroke="var(--line-strong)" strokeWidth="1.5" strokeDasharray="2 3.5" />
          </g>
          {/* Hotspots */}
          {(Object.keys(AT) as BodySpot[]).map((s) => {
            const region = regionOfSpot(s);
            if (!region) return null;
            const [x, y] = AT[s];
            const on = hot === null || hotSpots.has(s);
            return (
              <g key={s} data-body-spot className="transition-opacity duration-200" style={{ opacity: on ? 1 : 0.25 }}>
                <circle cx={x} cy={y} r="15" fill="url(#a2-glow)" />
                <circle cx={x} cy={y} r="4" fill="var(--exposure)" />
              </g>
            );
          })}
          {procs.flatMap(({ p, spots }) =>
            spots.map((s) => {
              const [x, y] = AT[s];
              return p.status === "performed" ? (
                <circle key={`${p.label}-${s}`} cx={x} cy={y} r="10" fill="none" stroke="var(--ink)" strokeWidth="1.75" />
              ) : (
                <circle key={`${p.label}-${s}`} cx={x} cy={y} r="10" fill="none" stroke="var(--exposure)" strokeWidth="1.75" strokeDasharray="3 3" className="a2-orbit" style={{ transformOrigin: `${x}px ${y}px` }} />
              );
            }),
          )}
          <text x="22" y="316" fontSize="10" fill="var(--ink-soft)">L</text>
          <text x="132" y="316" fontSize="10" fill="var(--ink-soft)">R</text>
        </svg>
        <figcaption className="mt-2 text-center text-[11.5px] text-ink-soft">Seen from behind</figcaption>
      </figure>

      <div className="min-w-0">
        <ul className="divide-y divide-line border-y border-line">
          {regions.map(({ inj }) => (
            <li
              key={inj.region}
              onPointerEnter={() => setHot(inj.region)}
              onPointerLeave={() => setHot(null)}
              onFocus={() => setHot(inj.region)}
              onBlur={() => setHot(null)}
              className={cn("py-2.5 transition-opacity duration-200", hot && hot !== inj.region && "opacity-45")}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[14px] font-medium text-ink">{inj.region}</span>
                {inj.imaging[0] ? (
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-soft">
                    {inj.imaging[0].study}
                    {inj.imaging[0].date ? `, ${fmtDate(inj.imaging[0].date, { year: false })} ${inj.imaging[0].date.slice(0, 4)}` : ""}
                  </span>
                ) : (
                  <span className="flex-1 text-[12.5px] text-ink-soft">Claimed; no imaging summary</span>
                )}
                <SourceChip sources={[...inj.claimedIn, ...inj.imaging.map((i) => i.source)]} variant="icon" className="size-5" />
              </div>
              {inj.imaging.length ? (
                <p className={cn("mt-0.5 text-[13px] leading-relaxed text-ink-soft", depth < 3 && "line-clamp-1")}>{capitalize(inj.imaging[0].finding)}</p>
              ) : null}
            </li>
          ))}
        </ul>
        <ul className="mt-4 flex flex-col gap-2">
          {c.treatment.procedures.map((p) => (
            <li key={p.label} className="flex items-start gap-2.5 text-[13.5px] leading-snug">
              {p.status === "performed" ? (
                <CheckCircleIcon size={17} weight="fill" className="mt-0.5 shrink-0 text-ink" aria-hidden />
              ) : (
                <ClockCountdownIcon size={17} className="mt-0.5 shrink-0 text-exposure" aria-hidden />
              )}
              <span className="text-ink">
                {capitalize(p.label)}{" "}
                <span className="text-ink-soft">
                  {p.status === "performed" ? (
                    <>performed <span className="tnum">{fmtDate(p.date)}</span></>
                  ) : (
                    <>recommended <span className="tnum">{fmtDate(p.date)}</span>, <span className="text-exposure">no date after {p.openForDays} days</span></>
                  )}
                </span>
              </span>
              <SourceChip sources={[p.source, ...p.also]} variant="icon" className="-mt-0.5 size-5" />
            </li>
          ))}
        </ul>
        {depth === 3 && c.treatment.statusText ? (
          <p className="mt-4 flex items-start gap-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            <span>“{c.treatment.statusText.value}”</span>
            <SourceChip sources={c.treatment.statusText.source} variant="icon" className="size-5" />
          </p>
        ) : null}
      </div>
    </div>
  );
}
