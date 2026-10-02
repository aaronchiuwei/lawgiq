"use client";

import { useGSAP } from "@gsap/react";
import {
  ArrowDownIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  ArrowUpIcon,
  BellSimpleIcon,
  CaretDownIcon,
  CheckCircleIcon,
  EnvelopeSimpleIcon,
  ClockCountdownIcon,
  GaugeIcon,
  HourglassMediumIcon,
  ListChecksIcon,
  MapPinIcon,
  PathIcon,
  PersonIcon,
  PhoneIcon,
  ReceiptIcon,
  ScalesIcon,
  SparkleIcon,
  StethoscopeIcon,
  WarningCircleIcon,
  WarningDiamondIcon,
  type Icon,
} from "@phosphor-icons/react";
import gsap from "gsap";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CountUp, DerivedNote, GeneratedLine, Portrait } from "@/components/case/atoms";
import { ConflictFlag, LastVisitDemo, ThresholdStepper } from "@/components/case/controls";
import { canAnimate } from "@/components/case/motion";
import { ShareEditor } from "@/components/case/share-editor";
import { KIND_ICON, SourceChip } from "@/components/case/sources";
import { HATCH, StageTrack } from "@/components/case/viz";
import type { FirmView } from "@/lib/access";
import type { SourceRef } from "@/lib/clio/types";
import type { CaseFile, Conflict, RankedEvent } from "@/lib/derive";
import { countWord, deriveHeadlines, type CaseHeadlines, type Headline } from "@/lib/derive/headlines";
import { capitalize, daysBetween, fmtDate, fmtUsd, relDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BodyMap } from "./body-map";
import { BriefMe } from "./brief-me";
import { MoneyRuler } from "./money";
import { CaseSpine, CaseSpineSimple } from "./spine";
import { useFront, useLinkHandlers, useLinked, type Depth } from "./state";

gsap.registerPlugin(useGSAP);

/**
 * Front Page, as a dashboard. An editorial voice inside
 * clear boxes: a client card and a summary card, a strip of labelled money
 * KPIs, then a bento of labelled cards (needs you, timeline, what changed,
 * injuries, care, specials, liability, strength). Every card answers its
 * question in its first line, carries its key figure in the header, and
 * expands in place, to the board's full width, for full detail.
 *
 * Motion: GSAP for the composed entrance (cards arrive in reading order, the
 * ruler and the spine draw themselves). Motion for the bento reflow when a
 * card expands or collapses, because those are layout transitions
 * that must stay interruptible.
 */

const SECTIONS = [
  { id: "needs", label: "Needs you" },
  { id: "story", label: "Timeline" },
  { id: "changes", label: "What changed" },
  { id: "injuries", label: "Injuries" },
  { id: "care", label: "Care" },
  { id: "money", label: "Specials" },
  { id: "liability", label: "Liability" },
  { id: "strength", label: "Strength" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const EASE = [0.23, 1, 0.32, 1] as const;

export function FrontPageFirm({ view }: { view: FirmView & { digestPending: boolean } }) {
  const c = view.case;
  const h = useMemo(() => deriveHeadlines(c), [c]);
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add({ motion: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
        const shell = root.current?.closest(".reveal-root");
        shell?.classList.add("revealed");
        if (ctx.conditions?.reduce || !canAnimate()) return;
        // Reading order: who, the money, then the board card by card. Cards
        // fade on the box (Motion owns its transform) and rise on the inside.
        const tl = gsap.timeline({ defaults: { ease: "expo.out", duration: 0.6 } });
        tl.fromTo("[data-reveal='top']", { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, stagger: 0.08, clearProps: "transform" })
          .fromTo("[data-reveal='portrait']", { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.6, ease: "power3.inOut" }, "<")
          .fromTo("[data-reveal='kpi']", { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, stagger: 0.06, clearProps: "transform" }, "<0.15")
          .fromTo("[data-ruler-cover]", { scaleX: 0 }, { scaleX: 1, duration: 0.9 }, "<0.25")
          .fromTo("[data-ruler-lien]", { scaleX: 0 }, { scaleX: 1, duration: 0.5 }, ">-0.35")
          .fromTo("[data-ruler-gap]", { scaleX: 0 }, { scaleX: 1, duration: 0.8 }, "<0.05")
          .fromTo("[data-ruler-tick]", { autoAlpha: 0, y: -4 }, { autoAlpha: 1, y: 0, stagger: 0.08, duration: 0.4 }, "<0.2")
          .fromTo("[data-reveal='card']", { autoAlpha: 0 }, { autoAlpha: 1, stagger: 0.06, duration: 0.5 }, 0.45)
          .fromTo("[data-card-inner]", { y: 14 }, { y: 0, stagger: 0.06, clearProps: "transform" }, "<")
          // The spine draws itself: activity grows, lanes extend, moments land in date order.
          .fromTo("[data-spine-bar]", { scaleY: 0 }, { scaleY: 1, stagger: 0.006, duration: 0.5 }, 0.7)
          .fromTo("[data-spine-line]", { scaleX: 0 }, { scaleX: 1, duration: 1, ease: "power2.inOut" }, 0.75)
          .fromTo("[data-spine-minor]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, stagger: 0.002, clearProps: "opacity,visibility" }, 1.05)
          .fromTo("[data-spine-dot] > span, span[data-spine-dot]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, stagger: 0.05, clearProps: "opacity,visibility" }, 1.15)
          .fromTo("[data-spine-open]", { scaleX: 0 }, { scaleX: 1, duration: 0.7 }, 1.5);
        return () => tl.kill();
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="mx-auto max-w-[90rem] px-3 pb-20 pt-4 sm:px-6 sm:pt-5">
      <TopRow view={view} h={h} />
      <KpiStrip c={c} h={h} />
      <SectionNav h={h} c={c} />
      <Bento view={view} h={h} />
      <BriefMe c={c} h={h} />
      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[12.5px] leading-relaxed text-ink-soft">
        <span>
          Read-only from Clio Manage. Keys: <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> detail · <Kbd>j</Kbd> <Kbd>k</Kbd> cards · <Kbd>n</Kbd> what&apos;s new · <Kbd>b</Kbd> brief me · <Kbd>Esc</Kbd> collapse · <Kbd>←</Kbd> <Kbd>→</Kbd> on the timeline
        </span>
        <LastVisitDemo />
      </footer>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="tnum mx-0.5 inline-grid min-w-[1.35rem] place-items-center rounded-[4px] border border-line-strong bg-card-bg px-1 text-[11px] text-ink">{children}</kbd>;
}

const BOX = "rounded-[10px] border border-line bg-card-bg";
const LABEL = "text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-soft";

/* ============================================================== top row == */

function TopRow({ view, h }: { view: FirmView & { digestPending: boolean }; h: CaseHeadlines }) {
  return (
    <div className="grid gap-3 lg:grid-cols-12">
      <ClientCard view={view} />
      <SummaryCard view={view} h={h} />
    </div>
  );
}

function ClientCard({ view }: { view: FirmView }) {
  const c = view.case;
  return (
    <section data-reveal="top" data-brief="who" aria-labelledby="client-name" className={cn(BOX, "flex items-center gap-4 p-4 lg:col-span-5")}>
      <div data-reveal="portrait" className="a2-portrait shrink-0">
        <Portrait
          name={c.client.name}
          photo={view.photo ?? c.client.avatarUrl}
          editable
          className="h-[4.75rem] w-[3.9rem] rounded-[4px] ring-1 ring-line"
          initialsClassName="font-[family-name:var(--font-display)] text-[1.6rem] font-light"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className={LABEL}>Client</p>
        <h1 id="client-name" className="mt-0.5 font-[family-name:var(--font-display)] text-[clamp(1.6rem,1.3rem+1vw,2.1rem)] leading-[1.05] tracking-[-0.02em] text-ink">
          {c.client.name}
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-soft">
          <span className="text-ink">{c.matter.caseType || c.matter.practiceArea}</span>
          <span aria-hidden>·</span>
          {c.matter.dateOfIncident ? (
            <span className="flex items-center gap-1">
              Incident <span className="tnum text-ink">{fmtDate(c.matter.dateOfIncident.value)}</span>
              <SourceChip sources={c.matter.dateOfIncident.source} variant="icon" className="size-5" />
            </span>
          ) : (
            <span>No incident date in Clio</span>
          )}
        </div>
        <StageTrack stages={c.matter.stagesInOrder} current={c.matter.stage} className="mt-2 max-w-[17rem]" />
        <ClientContact client={c.client} />
      </div>
    </section>
  );
}

/** How to reach the client: the first phone, email and address on their Clio contact. */
function ClientContact({ client }: { client: FirmView["case"]["client"] }) {
  const phone = client.phones[0];
  const email = client.emails[0];
  const addr = client.addresses[0];
  const place = addr ? [addr.street, addr.city, [addr.province, addr.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ") : null;
  const link = "truncate text-ink underline decoration-line-strong decoration-dotted underline-offset-4 transition-colors hover:decoration-ink";
  if (!phone && !email && !place) return <p className="mt-2.5 border-t border-line pt-2 text-[12.5px] text-ink-soft">No contact details in Clio.</p>;
  return (
    <address className="mt-2.5 flex flex-col gap-1 border-t border-line pt-2 text-[12.5px] not-italic text-ink-soft">
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {phone ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <PhoneIcon size={13} className="shrink-0" aria-hidden />
            <a href={`tel:${phone.number.replace(/[^\d+]/g, "")}`} className={cn(link, "tnum")} aria-label={`Call ${client.name}, ${phone.name.toLowerCase()} phone`}>
              {phone.number}
            </a>
          </span>
        ) : null}
        {email ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <EnvelopeSimpleIcon size={13} className="shrink-0" aria-hidden />
            <a href={`mailto:${email.address}`} className={link} aria-label={`Email ${client.name}`}>
              {email.address}
            </a>
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        {place ? (
          <>
            <MapPinIcon size={13} className="shrink-0" aria-hidden />
            <span className="truncate" title={place}>
              {place}
            </span>
          </>
        ) : null}
        <SourceChip sources={client.source} variant="icon" className="ml-auto size-5 shrink-0" />
      </span>
    </address>
  );
}

function SummaryCard({ view, h }: { view: FirmView & { digestPending: boolean }; h: CaseHeadlines }) {
  const c = view.case;
  const [open, setOpen] = useState(false);
  const [first, ...rest] = c.digest.sentences;
  const digestKind = c.digest.generator.kind === "ai" ? "ai" : "rules";
  return (
    <section data-reveal="top" aria-labelledby="summary-h" className={cn(BOX, "flex flex-col p-4 lg:col-span-7")}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="summary-h" className={LABEL}>
          Summary
        </h2>
        <DerivedNote kind={digestKind} title="How this summary was written" sources={c.digest.sentences.flatMap((s) => s.sources)}>
          {digestKind === "ai"
            ? "Written once by the model from the derived facts and cached until the Clio data changes. Every sentence cites the records it rests on; uncited sentences are dropped."
            : "Assembled from Clio fields (case summary, stage, treatment status, value and limits) and the procedures found in the calendar and notes. Regenerated only when the Clio data changes."}
        </DerivedNote>
        <span className="ml-auto hidden text-[12px] text-ink-soft xl:inline">
          <GeneratedLine itemCount={c.digest.itemCount} generatedAt={c.digest.generatedAt} generator={c.digest.generator} />
          {view.digestPending ? <span className="sync-pulse"> · AI digest generating</span> : null}
        </span>
      </div>
      {first ? (
        <p className="mt-2 font-[family-name:var(--font-display)] text-[1.06rem] leading-[1.5] text-ink">
          {first.text}
          <SourceChip sources={first.sources} variant="footnote" footnote={1} />{" "}
          <AnimatePresence initial={false}>
            {open
              ? rest.map((s, i) => (
                  <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: i * 0.06, duration: 0.25 } }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
                    {s.text}
                    <SourceChip sources={s.sources} variant="footnote" footnote={i + 2} />{" "}
                  </motion.span>
                ))
              : null}
          </AnimatePresence>
          {rest.length ? (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="ml-1 inline-flex items-center gap-1 align-baseline font-[family-name:var(--font-text)] text-[13px] text-signal underline decoration-dotted underline-offset-4 hover:decoration-solid"
            >
              {open ? "Less" : `Read more (${rest.length})`}
            </button>
          ) : null}
        </p>
      ) : (
        <p className="mt-2 text-[14px] text-ink-soft">No summary yet.</p>
      )}
      <p className="mt-auto pt-2 text-[12.5px] text-ink-soft">
        <span className="font-medium text-ink">Story so far:</span> {h.story.text}
      </p>
    </section>
  );
}

function ScoreRing({ value, size = 40 }: { value: number; size?: number }) {
  const r = 15;
  const circ = 2 * Math.PI * r;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--line)" strokeWidth="3" />
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(value / 100) * circ} ${circ}`} />
      </svg>
      <span className="tnum font-[family-name:var(--font-display)] text-ink" style={{ fontSize: size * 0.36 }}>
        {value}
      </span>
    </span>
  );
}

/* ============================================================ KPI strip == */

/** The money, as labelled tiles. Exposure is the wide red one, with the ruler. */
function KpiStrip({ c, h }: { c: CaseFile; h: CaseHeadlines }) {
  const v = c.kpis.estimatedValue;
  const lim = c.kpis.coverage.defendantLimit;
  const sp = c.kpis.specials;
  const coverageFlag = c.conflicts.find((x) => x.anchor === "coverage");
  const m = h.money;
  const big = "font-[family-name:var(--font-display)] text-[clamp(1.6rem,1.2rem+1vw,2.1rem)] leading-none tracking-[-0.02em] tnum";
  return (
    <section aria-label="Key figures" data-brief="money" className="a2-kpis mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-12">
      <Kpi label="Estimated value" className="lg:col-span-2" source={v ? [v.source, ...(v.also ?? [])] : null}>
        {v ? <CountUp value={v.value} className={cn(big, "text-ink")} /> : <span className="text-[14px] text-ink-soft">Not set in Clio</span>}
        <p className="mt-2 text-[12px] text-ink-soft">{v?.source.date ? `Set ${fmtDate(v.source.date)}` : "From the matter"}</p>
      </Kpi>
      <Kpi label="Per-person limit" className="lg:col-span-2" source={lim ? [lim.source, ...(lim.also ?? [])] : null}>
        {lim ? <CountUp value={lim.value} delay={80} className={cn(big, "text-ink")} /> : <span className="text-[14px] text-ink-soft">No limit recorded</span>}
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-soft">
          {c.kpis.coverage.confirmed ? (
            <span className="inline-flex items-center gap-1 text-good">
              <CheckCircleIcon size={12} weight="fill" aria-hidden /> In writing
            </span>
          ) : (
            <span className="text-caution">Not confirmed</span>
          )}
          {coverageFlag ? <ConflictFlag conflict={coverageFlag} label="Whose limit?" /> : null}
        </p>
      </Kpi>
      <Kpi
        label={m.gap !== null && m.gap > 0 ? "Exposed above coverage" : "Value against coverage"}
        tone={m.gap !== null && m.gap > 0 ? "exposure" : undefined}
        className="col-span-2 md:order-first md:col-span-4 lg:order-none lg:col-span-4"
        extra={
          c.kpis.coverage.gap ? (
            <DerivedNote kind="derived" sources={[c.kpis.coverage.gap.source, ...(c.kpis.coverage.gap.also ?? [])]}>
              {c.kpis.coverage.gap.derivation}
              {m.specialsOverLimit ? " Billed specials alone already exceed the limit." : ""}
            </DerivedNote>
          ) : null
        }
      >
        {m.gap !== null ? (
          <CountUp value={Math.max(0, m.gap)} delay={160} className={cn(big, m.gap > 0 ? "text-exposure" : "text-good")} />
        ) : (
          <span className="text-[14px] text-ink-soft">Needs value and limit</span>
        )}
        <MoneyRuler c={c} className="mt-1" compact />
      </Kpi>
      <Kpi label="Specials billed" className="lg:col-span-2" source={sp ? sp.source : null}>
        {sp ? <CountUp value={sp.value} delay={240} className={cn(big, "text-ink")} /> : <span className="text-[14px] text-ink-soft">No tally</span>}
        <p className="mt-2 text-[12px] text-ink-soft">
          {sp?.interim ? <span className="text-caution">Interim</span> : "Final"}
          {m.specialsOverLimit ? <span> · over the limit</span> : null}
        </p>
      </Kpi>
      <a
        href="#strength"
        onClick={(e) => {
          e.preventDefault();
          scrollToSection("strength");
        }}
        data-reveal="kpi"
        data-brief="strength"
        className={cn(BOX, "group flex flex-col p-4 transition-colors duration-150 hover:border-line-strong lg:col-span-2")}
        aria-label={`Case strength ${h.strength.text}`}
      >
        <span className={LABEL}>Case strength</span>
        <span className="mt-2 flex items-center gap-3">
          <ScoreRing value={c.scorecard.total} size={46} />
          <span className="text-[12px] leading-snug text-ink-soft">
            of 100
            {h.strength.weakest ? <span className="block text-ink">weak: {h.strength.weakest.label.toLowerCase()}</span> : null}
          </span>
        </span>
      </a>
    </section>
  );
}

function Kpi({ label, children, className, source, tone, extra }: { label: string; children: ReactNode; className?: string; source?: SourceRef | SourceRef[] | null; tone?: "exposure"; extra?: ReactNode }) {
  return (
    <div data-reveal="kpi" className={cn(BOX, "flex min-w-0 flex-col p-4", tone === "exposure" && "border-exposure/35 bg-exposure-wash/40", className)}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className={cn(LABEL, tone === "exposure" && "text-exposure")}>{label}</span>
        <span className="ml-auto flex items-center gap-1">
          {extra}
          {source ? <SourceChip sources={source} variant="icon" className="size-5" /> : null}
        </span>
      </div>
      {children}
    </div>
  );
}

/* ================================================================ bento == */

/** `cols` is the card's width on the 12-column board when nothing in its row is expanded. */
type CardSpec = { id: SectionId; label: string; icon: Icon; cols: number; hl: Headline; figure?: ReactNode; flag?: ReactNode; brief?: string };
type BentoCard = CardSpec & { body: (d: Depth) => ReactNode };

/**
 * The board's rows. The first is Needs (two rows tall) beside the timeline
 * and what changed; the others are plain rows. An expanded card stays at its
 * row's level, takes the full width, and pushes the rest of its row below it.
 */
const ROWS: SectionId[][] = [
  ["needs", "story", "changes"],
  ["injuries", "care", "money"],
  ["liability", "strength"],
];

// Literal class names so Tailwind generates them.
const LG_COLS = ["", "lg:col-span-1", "lg:col-span-2", "lg:col-span-3", "lg:col-span-4", "lg:col-span-5", "lg:col-span-6", "lg:col-span-7", "lg:col-span-8", "lg:col-span-9", "lg:col-span-10", "lg:col-span-11", "lg:col-span-12"];

/** Shares 12 columns among cards in proportion to their usual widths (largest remainder). */
function apportion(widths: number[]): number[] {
  const total = widths.reduce((a, b) => a + b, 0);
  const exact = widths.map((w) => (w * 12) / total);
  const out = exact.map(Math.floor);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < 12 - out.reduce((a, b) => a + b, 0); k++) out[order[k][1]]++;
  return out;
}

/** Each card in board order, with its grid classes for the current expansions. */
function layoutBoard(cards: BentoCard[], open: ReadonlySet<SectionId>): { card: BentoCard; cls: string }[] {
  const byId = new Map(cards.map((x) => [x.id, x]));
  const cls = (cols: number, tall = false) => cn("md:col-span-6", LG_COLS[cols], tall && "lg:row-span-2");
  return ROWS.flatMap((row, r) => {
    const opened = row.filter((id) => open.has(id)).map((id) => ({ card: byId.get(id)!, cls: cls(12) }));
    const rest = row.filter((id) => !open.has(id)).map((id) => byId.get(id)!);
    if (r === 0) {
      // Needs sits beside whatever is left of the stack; the stack takes the rest of the width.
      const stack = rest.filter((x) => x.id !== "needs");
      const needs = rest.find((x) => x.id === "needs");
      const laid = rest.map((x) => (x === needs ? { card: x, cls: cls(stack.length ? x.cols : 12, stack.length === 2) } : { card: x, cls: cls(needs ? 12 - needs.cols : 12) }));
      return [...opened, ...laid];
    }
    const cols = apportion(rest.map((x) => x.cols));
    return [...opened, ...rest.map((x, i) => ({ card: x, cls: cls(cols[i]) }))];
  });
}

function Bento({ view, h }: { view: FirmView; h: CaseHeadlines }) {
  const c = view.case;
  // Any card expands in place to full width and full detail, at its row's
  // level; the rest of its row moves below it.
  const [openIds, setOpenIds] = useState<ReadonlySet<SectionId>>(() => new Set());
  const toggle = (id: SectionId) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const storyConflicts = c.conflicts.filter((x) => c.events.some((e) => e.id === x.anchor && e.kind !== "task"));
  const changes = c.changes.items.length;
  const cards: BentoCard[] = [
    {
      id: "needs",
      label: "Needs you",
      icon: ListChecksIcon,
      cols: 3,
      hl: h.needs,
      figure: `${c.tasks.overdue.length} overdue`,
      brief: "needs",
      body: (d) => <NeedsQueue c={c} depth={d} />,
    },
    {
      id: "story",
      label: "Case timeline",
      icon: PathIcon,
      cols: 9,
      hl: h.story,
      figure: `${c.topEvents.length} moments`,
      flag: storyConflicts.length ? <ConflictCount items={storyConflicts} /> : null,
      // On the board: the simple spine. Expanded: every lane and the story.
      body: (d) =>
        d === 3 ? (
          <div>
            <div data-brief="spine">
              <CaseSpine c={c} />
            </div>
            <div className="mt-6 border-t border-line pt-5">
              <Story c={c} depth={3} />
              {storyConflicts.length ? <MarginConflicts items={storyConflicts} className="mt-6" /> : null}
            </div>
          </div>
        ) : (
          <div data-brief="spine" className="flex flex-1 flex-col">
            <CaseSpineSimple c={c} />
          </div>
        ),
    },
    {
      id: "changes",
      label: "What changed",
      icon: BellSimpleIcon,
      cols: 9,
      hl: {
        text: !changes
          ? `Nothing new in Clio since ${fmtDate(c.changes.since, { year: false })}.`
          : c.changes.firstVisit
            ? `${countWord(changes)} new ${changes === 1 ? "record" : "records"} in the last two weeks.`
            : `${countWord(changes)} new ${changes === 1 ? "record" : "records"} since ${fmtDate(c.changes.since, { year: false })}.`,
        sub: null,
        figure: `${changes} new`,
      },
      figure: <span className="text-signal">{changes} new</span>,
      body: (d) => <ChangesBody c={c} depth={d} />,
    },
    {
      id: "injuries",
      label: "Injuries",
      icon: PersonIcon,
      cols: 4,
      hl: h.injuries,
      figure: h.injuries.figure,
      body: (d) => <BodyMap c={c} depth={d} compact={d < 3} />,
    },
    {
      id: "care",
      label: "Care and attendance",
      icon: StethoscopeIcon,
      cols: 5,
      hl: h.care,
      figure: h.care.figure,
      body: (d) => (
        <div className={d < 3 ? "[--care-label:8.5rem]" : "[--care-label:13rem]"}>
          <Care view={view} depth={d} />
        </div>
      ),
    },
    {
      id: "money",
      label: "Medical specials",
      icon: ReceiptIcon,
      cols: 3,
      hl: h.specials,
      figure: h.specials.figure,
      body: (d) => (
        <div className={cn(d === 3 && "grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]")}>
          <Money c={c} depth={d} />
          {d === 3 ? (
            <div className="text-[12.5px] leading-relaxed text-ink-soft">
              <MoneyMargin c={c} />
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-1 border-t border-line pt-2.5 text-[12.5px] text-ink-soft">
              Firm spend <CountUp value={c.kpis.firmSpend.value} className="ml-auto font-medium text-ink" />
              <SourceChip sources={c.kpis.firmSpend.items.map((i) => i.source)} variant="icon" className="size-5" />
            </p>
          )}
        </div>
      ),
    },
    {
      id: "liability",
      label: "Liability",
      icon: ScalesIcon,
      cols: 7,
      hl: h.liability,
      figure: h.liability.figure,
      body: (d) => <Liability c={c} depth={d} />,
    },
    {
      id: "strength",
      label: "Case strength",
      icon: GaugeIcon,
      cols: 5,
      hl: h.strength,
      figure: `${c.scorecard.total}/100`,
      body: (d) => <Strength c={c} depth={d} weakest={h.strength.weakest?.id ?? null} />,
    },
  ];

  return (
    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-6 lg:grid-cols-12">
      {layoutBoard(cards, openIds).map(({ card: { body, ...spec }, cls }) => {
        const open = openIds.has(spec.id);
        return (
          <Card key={spec.id} spec={spec} span={cls} open={open} onToggle={() => toggle(spec.id)}>
            {body(open ? 3 : 2)}
          </Card>
        );
      })}
    </div>
  );
}

function CardHeader({ spec, open, onToggle }: { spec: CardSpec; open: boolean; onToggle: () => void }) {
  const Icon = spec.icon;
  return (
    <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
      <Icon size={15} className="shrink-0 text-ink-soft" aria-hidden />
      <h2 id={`${spec.id}-h`} className={cn(LABEL, "text-ink")}>
        {spec.label}
      </h2>
      {spec.flag}
      <span className="tnum ml-auto truncate text-[13px] text-ink-soft">{spec.figure}</span>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${spec.id}-body`}
        aria-label={open ? `Collapse ${spec.label}` : `Expand ${spec.label}`}
        title={open ? "Collapse" : "Expand"}
        className="-mr-1.5 grid size-7 shrink-0 place-items-center rounded-full text-ink-soft transition-[background-color,color,transform] duration-150 hover:bg-paper-2 hover:text-ink active:scale-[0.92]"
      >
        {open ? <ArrowsInSimpleIcon size={15} aria-hidden /> : <ArrowsOutSimpleIcon size={15} aria-hidden />}
      </button>
    </header>
  );
}

function Card({ spec, span, open, onToggle, children }: { spec: CardSpec; span: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  // Expanding reflows the board; bring the card's head into view once it settles.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (r && (r.top < 80 || r.top > window.innerHeight * 0.6)) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 320);
    return () => window.clearTimeout(t);
  }, [open]);
  return (
    <motion.section
      ref={ref}
      layout
      transition={{ type: "spring", duration: 0.5, bounce: 0.08 }}
      id={spec.id}
      data-section
      data-reveal="card"
      data-brief={spec.brief}
      aria-labelledby={`${spec.id}-h`}
      className={cn(BOX, "a2-card flex min-w-0 scroll-mt-32 flex-col overflow-hidden", span, open && "border-line-strong")}
    >
      <motion.div layout="position" data-card-inner className="flex flex-1 flex-col">
        <CardHeader spec={spec} open={open} onToggle={onToggle} />
        <div id={`${spec.id}-body`} className={cn("flex flex-1 flex-col", open ? "px-5 pb-6 pt-4 sm:px-6" : "px-4 pb-4 pt-3")}>
          <p className={cn("font-[family-name:var(--font-display)] leading-snug text-ink", open ? "text-[1.5rem] tracking-[-0.01em]" : "text-[1.08rem] tracking-[-0.005em]")}>{spec.hl.text}</p>
          {open && spec.hl.sub ? <p className="mt-1 max-w-[56rem] text-[14px] leading-relaxed text-ink-soft">{spec.hl.sub}</p> : null}
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={open ? "full" : "brief"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE, delay: 0.06 } }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              className={cn("flex min-w-0 flex-1 flex-col", open ? "mt-5" : "mt-3")}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.section>
  );
}

function ConflictCount({ items }: { items: Conflict[] }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-full bg-caution-wash px-1.5 text-[11px] font-medium text-caution" title={items.map((x) => x.title).join("\n")}>
      <WarningDiamondIcon size={11} weight="fill" aria-hidden />
      {items.length} to check
    </span>
  );
}

function ChangesBody({ c, depth }: { c: CaseFile; depth: Depth }) {
  const { changesOn, toggleChanges } = useFront();
  const items = depth === 3 ? c.changes.items : c.changes.items.slice(0, 4);
  if (!items.length)
    return <p className="text-[13px] text-ink-soft">You&apos;re up to date. Anything added in Clio after your last visit shows here and lights up across the board.</p>;
  return (
    <div className="flex flex-1 flex-col">
      <ul aria-live="polite" className="grid gap-x-6 sm:grid-cols-2">
        {items.map((e) => {
          const I = KIND_ICON[e.source.kind];
          return (
            <li key={e.id} className="grid grid-cols-[3.25rem_1rem_minmax(0,1fr)_auto] items-baseline gap-2 border-t border-line py-2">
              <span className="tnum text-[12px] text-ink-soft">{fmtDate(e.date, { year: false })}</span>
              <I size={13} className="translate-y-0.5 text-signal" aria-hidden />
              <span className="truncate text-[13px] text-ink">{e.title}</span>
              <SourceChip sources={e.source} variant="icon" className="size-5" />
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-pressed={changesOn}
          onClick={toggleChanges}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-medium transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.97]",
            changesOn ? "border-signal bg-signal text-paper" : "border-line-strong text-ink hover:border-signal",
          )}
        >
          <SparkleIcon size={13} weight="fill" aria-hidden />
          {changesOn ? "Lit up across the board" : "Light them up on the board (n)"}
        </button>
        {c.changes.items.length > items.length ? <span className="text-[12px] text-ink-soft">{c.changes.items.length - items.length} more when expanded</span> : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- needs you -- */


type QueueItem = {
  id: string;
  tone: "exposure" | "caution" | "ink" | "good";
  icon: "overdue" | "waiting" | "open" | "due" | "contact" | "sol";
  title: string;
  meta: ReactNode;
  sources: SourceRef[];
  providers: string[];
  events: string[];
  conflicts: Conflict[];
  rank: number;
};

function buildQueue(c: CaseFile): QueueItem[] {
  const out: QueueItem[] = [];
  const shortName = (ids: string[], fallback: string | null) => c.providers.find((p) => ids.includes(p.id))?.shortName ?? fallback?.replace(/,?\s*(P\.C\.|PLLC)$/, "") ?? "Someone else";
  const conflictsFor = (id: string) => c.conflicts.filter((x) => x.anchor === id);
  for (const t of c.tasks.overdue)
    out.push({ id: t.id, tone: "exposure", icon: "overdue", title: t.title, meta: <span className="text-exposure">{relDays(t.daysUntilDue)} · on the firm</span>, sources: [t.source], providers: t.providerIds, events: [t.id], conflicts: conflictsFor(t.id), rank: 100 - (t.daysUntilDue ?? 0) });
  for (const t of c.tasks.waiting) {
    const late = (t.daysUntilDue ?? 0) < 0;
    out.push({
      id: t.id,
      tone: late ? "caution" : "ink",
      icon: "waiting",
      title: `${shortName(t.providerIds, t.waitingOn)} owes: ${t.title.charAt(0).toLowerCase()}${t.title.slice(1)}`,
      meta: <span className={late ? "text-caution" : undefined}>{late ? `${relDays(t.daysUntilDue)}, waiting` : `due ${relDays(t.daysUntilDue)}`}</span>,
      sources: [t.source],
      providers: t.providerIds,
      events: [t.id],
      conflicts: conflictsFor(t.id),
      rank: late ? 80 - (t.daysUntilDue ?? 0) / 10 : 20 - (t.daysUntilDue ?? 0),
    });
  }
  for (const p of c.treatment.procedures.filter((p) => p.status === "recommended" && p.openForDays !== null))
    out.push({
      id: `proc-${p.label}`,
      tone: "exposure",
      icon: "open",
      title: `${capitalize(p.label)} still has no date`,
      meta: `open ${p.openForDays} days · ${p.followUps} chasers`,
      sources: [p.source, ...p.also],
      providers: c.events.find((e) => e.id === p.source.id)?.providerIds ?? [],
      events: [p.source.id],
      conflicts: [],
      rank: 90,
    });
  for (const t of c.tasks.comingUp)
    out.push({ id: t.id, tone: "ink", icon: "due", title: t.title, meta: `due ${relDays(t.daysUntilDue)}`, sources: [t.source], providers: t.providerIds, events: [t.id], conflicts: conflictsFor(t.id), rank: 60 - (t.daysUntilDue ?? 0) });
  const cc = c.clientContact;
  if (cc.last)
    out.push({
      id: "client-contact",
      tone: cc.stale ? "exposure" : "ink",
      icon: "contact",
      title: cc.stale ? `No client contact for ${cc.last.daysAgo} days` : `Client last heard from ${relDays(-cc.last.daysAgo)}`,
      meta: `${cc.last.channel === "phone" ? "Phone" : "Email"}: ${cc.last.subject}${cc.nextScheduled ? ` · next ${fmtDate(cc.nextScheduled.date, { year: false })}` : ""}`,
      sources: [cc.last.source],
      providers: [],
      events: [cc.last.source.id],
      conflicts: [],
      rank: cc.stale ? 95 : 10,
    });
  for (const d of c.deadlines.filter((d) => d.kind === "court" || d.kind === "decision"))
    out.push({ id: d.id, tone: "ink", icon: "due", title: d.title, meta: `${fmtDate(d.date, { year: false })}, ${relDays(d.daysUntil)}`, sources: [d.source], providers: [], events: [d.id], conflicts: [], rank: 30 - d.daysUntil / 10 });
  return out.sort((a, b) => b.rank - a.rank);
}

const QUEUE_ICON = {
  overdue: WarningCircleIcon,
  waiting: HourglassMediumIcon,
  open: ClockCountdownIcon,
  due: ArrowDownIcon,
  contact: PhoneIcon,
  sol: CheckCircleIcon,
};

function NeedsQueue({ c, depth }: { c: CaseFile; depth: Depth }) {
  const all = useMemo(() => buildQueue(c), [c]);
  const shown = all.slice(0, depth === 3 ? all.length : 5);
  return (
    <div className="flex flex-1 flex-col">
      <Sol c={c} />
      <ol className="mt-1 flex flex-col">
        <AnimatePresence initial={false}>
          {shown.map((it, i) => (
            <motion.li key={it.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}>
              <QueueRow it={it} n={i + 1} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {all.length > shown.length ? <p className="mt-auto pt-2 text-[12.5px] text-ink-soft">{all.length - shown.length} more when expanded</p> : null}
    </div>
  );
}

function QueueRow({ it, n }: { it: QueueItem; n: number }) {
  const linked = useLinked({ providers: it.providers, events: it.events });
  const handlers = useLinkHandlers(it.providers);
  const Icon = QUEUE_ICON[it.icon];
  const tone = it.tone === "exposure" ? "text-exposure" : it.tone === "caution" ? "text-caution" : it.tone === "good" ? "text-good" : "text-ink-soft";
  return (
    <div {...handlers} className={cn("a2-linkable grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2.5 border-t border-line py-2.5", linked === "on" && "a2-on", linked === "off" && "a2-off")}>
      <Icon size={16} weight={it.tone === "exposure" ? "fill" : "regular"} className={cn("mt-0.5", tone)} aria-label={`${n}`} />
      <div className="min-w-0">
        <p className="line-clamp-2 text-[13.5px] leading-snug text-ink">{it.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-soft">
          <span className="tnum">{it.meta}</span>
          <SourceChip sources={it.sources} variant="icon" className="size-5" />
          {it.conflicts.map((x) => (
            <ConflictFlag key={x.id} conflict={x} />
          ))}
        </p>
      </div>
    </div>
  );
}

/** The limitations date is always pinned on top, and a met one reads as met. */
function Sol({ c }: { c: CaseFile }) {
  const sol = c.sol;
  if (!sol.date) return null;
  const ok = sol.status === "satisfied";
  return (
    <div className={cn("flex items-start gap-2.5 rounded-[6px] px-2.5 py-2", ok ? "bg-good-wash" : sol.status === "expired" ? "bg-exposure-wash" : "bg-caution-wash")}>
      {ok ? <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-good" aria-hidden /> : <ClockCountdownIcon size={16} className="mt-0.5 shrink-0 text-exposure" aria-hidden />}
      <div className="min-w-0 text-[12.5px] leading-snug">
        <p className={cn("font-medium", ok ? "text-good" : "text-exposure")}>
          Statute of limitations {ok ? "satisfied" : sol.status === "expired" ? "expired" : relDays(sol.daysUntil)}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-ink-soft">
          <span className="tnum">{fmtDate(sol.date)}</span>
          {ok ? <span>· filed in time</span> : null}
          <SourceChip sources={sol.sources} variant="icon" className="size-5" />
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- contents/nav -- */

const figureOf = (h: CaseHeadlines, c: CaseFile, id: SectionId): string | null =>
  id === "needs"
    ? h.needs.figure
    : id === "story"
      ? h.story.figure
      : id === "changes"
        ? `${c.changes.items.length} new`
        : id === "injuries"
          ? h.injuries.figure
          : id === "care"
            ? h.care.figure
            : id === "money"
              ? h.specials.figure
              : id === "liability"
                ? h.liability.figure
                : `${c.scorecard.total}`;

/** Document offset that ignores in-flight layout transforms (unlike getBoundingClientRect). */
function docTop(el: HTMLElement): number {
  let y = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) y += n.offsetTop;
  return y;
}

/** Room taken by the sticky masthead, including the docked nav once it shows. */
function headOffset(): number {
  const head = document.querySelector<HTMLElement>(".a2-masthead")?.offsetHeight ?? 56;
  const docked = document.querySelector("#a2-dock nav") ? 0 : 41;
  return head + docked + 10;
}

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: docTop(el) - headOffset(), behavior: reduce ? "auto" : "smooth" });
}

const noSubscribe = () => () => {};

/** Once the KPI strip scrolls away, the card labels dock under the masthead as a nav. */
function SectionNav({ h, c }: { h: CaseHeadlines; c: CaseFile }) {
  const { briefing } = useFront();
  const [docked, setDocked] = useState(false);
  const [active, setActive] = useState<SectionId | null>(null);

  useEffect(() => {
    const index = document.querySelector(".a2-kpis");
    if (!index) return;
    // The masthead covers the top: the nav takes over as the KPIs slide under it.
    const head = document.querySelector<HTMLElement>(".a2-masthead")?.offsetHeight ?? 56;
    const io = new IntersectionObserver(([e]) => setDocked(!e.isIntersecting && e.boundingClientRect.top < head + 4), { threshold: 0, rootMargin: `-${head + 1}px 0px 0px 0px` });
    io.observe(index);
    const spy = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id as SectionId);
      },
      { rootMargin: "-120px 0px -55% 0px" },
    );
    document.querySelectorAll("[data-section]").forEach((s) => spy.observe(s));
    return () => {
      io.disconnect();
      spy.disconnect();
    };
  }, []);

  // j / k step between sections. Repeated presses step from the last target,
  // not from wherever the smooth scroll has got to.
  const last = useRef<{ i: number; t: number } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if ((e.key !== "j" && e.key !== "k") || briefing) return;
      let i: number;
      if (last.current && performance.now() - last.current.t < 900) {
        i = last.current.i + (e.key === "j" ? 1 : -1);
      } else {
        const off = headOffset();
        const tops = SECTIONS.map((s) => docTop(document.getElementById(s.id)!) - window.scrollY - off);
        i = e.key === "j" ? tops.findIndex((top) => top > 4) : (tops.map((top, n) => [top, n] as const).filter(([top]) => top < -4).at(-1)?.[1] ?? -1);
        if (e.key === "j" && i === -1) i = SECTIONS.length;
      }
      if (i < 0) {
        last.current = null;
        window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        return;
      }
      if (i >= SECTIONS.length) return;
      last.current = { i, t: performance.now() };
      scrollToSection(SECTIONS[i].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [briefing]);

  const dock = useSyncExternalStore(noSubscribe, () => document.getElementById("a2-dock"), () => null);
  if (!dock) return null;

  return createPortal(
    <AnimatePresence>
      {docked ? (
        <motion.nav
          aria-label="Jump to section"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
          transition={{ duration: 0.22, ease: EASE }}
          className="border-t border-line"
        >
          <ul className="mx-auto flex max-w-[90rem] gap-1 overflow-x-auto px-3 py-1.5 sm:px-6">
            {SECTIONS.map((s) => {
              const on = active === s.id;
              return (
                <li key={s.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => scrollToSection(s.id)}
                    aria-current={on ? "true" : undefined}
                    className={cn("relative flex h-8 items-baseline gap-2 rounded-full px-3 pt-1.5 text-[12.5px] transition-colors duration-150", on ? "text-ink" : "text-ink-soft hover:text-ink")}
                  >
                    {on ? <motion.span layoutId="a2-nav-pill" className="absolute inset-0 rounded-full bg-paper-2" transition={{ type: "spring", duration: 0.35, bounce: 0.12 }} /> : null}
                    <span className="relative font-medium">{s.label}</span>
                    <span className="tnum relative text-ink-soft">{figureOf(h, c, s.id)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </motion.nav>
      ) : null}
    </AnimatePresence>,
    dock,
  );
}

function MarginConflicts({ items, className }: { items: Conflict[]; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={cn("flex flex-col gap-3 border-l-2 border-caution pl-3 text-[12.5px] leading-relaxed text-ink-soft", className)}>
      <p className="font-medium text-caution">Records that disagree</p>
      {items.map((x) => (
        <div key={x.id}>
          <ConflictFlag conflict={x} label={x.title} />
          <p className="mt-1">{x.detail}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- story -- */

function Story({ c, depth }: { c: CaseFile; depth: Depth }) {
  const [all, setAll] = useState(false);
  const top = [...c.topEvents].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div>
      <ol className="grid gap-x-8 sm:grid-cols-2">
        {top.map((e) => (
          <StoryRow key={e.id} e={e} c={c} />
        ))}
      </ol>
      {depth === 3 ? (
        <div className="mt-6">
          <button
            type="button"
            aria-expanded={all}
            onClick={() => setAll((v) => !v)}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-line-strong px-4 text-[13.5px] text-ink transition-[border-color,transform] duration-150 hover:border-ink active:scale-[0.97]"
          >
            {all ? <ArrowUpIcon size={14} aria-hidden /> : <ArrowDownIcon size={14} aria-hidden />}
            {all ? "Hide the full chronology" : `Show the full chronology (${c.events.length} records)`}
          </button>
          {all ? <Chronology c={c} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function StoryRow({ e, c }: { e: RankedEvent; c: CaseFile }) {
  const linked = useLinked({ providers: e.providerIds, events: [e.id] });
  const handlers = useLinkHandlers(e.providerIds, [e.id]);
  const dot = e.category === "liability" ? "bg-exposure" : e.category === "medical" || e.category === "damages" ? "bg-signal" : "bg-ink";
  return (
    <li {...handlers} className={cn("a2-linkable grid grid-cols-[4.25rem_0.6rem_minmax(0,1fr)] items-baseline gap-x-2.5 border-t border-line py-2.5", linked === "on" && "a2-on", linked === "off" && "a2-off")}>
      <span className="tnum text-[12.5px] text-ink-soft">
        {fmtDate(e.date, { year: false })} <span className="text-[11.5px]">{e.date.slice(2, 4)}&apos;</span>
      </span>
      <span className={cn("size-2 rounded-full", dot)} aria-hidden />
      <div className="min-w-0">
        <p className="text-[14px] leading-snug text-ink">{e.title}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-soft">
          <span className="font-medium text-ink">{c.digest.reasons?.[e.id] ?? e.reason}</span>
          <SourceChip sources={[e.source, ...e.duplicates]} variant="icon" className="size-5" />
          {c.conflicts
            .filter((x) => x.anchor === e.id)
            .map((x) => (
              <ConflictFlag key={x.id} conflict={x} />
            ))}
        </p>
      </div>
    </li>
  );
}

function Chronology({ c }: { c: CaseFile }) {
  const years = [...new Set(c.events.map((e) => e.date.slice(0, 4)))];
  return (
    <div className="mt-6 flex flex-col gap-6">
      {years.map((y) => (
        <section key={y} aria-label={y}>
          <h3 className="tnum font-[family-name:var(--font-display)] text-[1.4rem] text-ink">{y}</h3>
          <ul className="mt-2 divide-y divide-line">
            {c.events
              .filter((e) => e.date.startsWith(y))
              .map((e) => (
                <ChronoRow key={e.id} e={e} today={c.today} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ChronoRow({ e, today }: { e: RankedEvent; today: string }) {
  const linked = useLinked({ providers: e.providerIds, events: [e.id] });
  const I = KIND_ICON[e.source.kind];
  return (
    <li className={cn("a2-linkable grid grid-cols-[3.75rem_1.25rem_minmax(0,1fr)_auto] items-baseline gap-2 py-2", linked === "on" && "a2-on", linked === "off" && "a2-off")}>
      <span className="tnum text-[12.5px] text-ink-soft">{fmtDate(e.date, { year: false })}</span>
      <I size={14} className="translate-y-0.5 text-ink-soft" aria-hidden />
      <span className="min-w-0 text-[13.5px] leading-snug text-ink">
        {e.title}
        {e.date > today ? <span className="ml-2 text-[12px] text-signal">Upcoming</span> : null}
        {e.reason && e.ruleId !== "chaser" ? <span className="ml-2 text-[12px] text-ink-soft">{e.reason}</span> : null}
      </span>
      <SourceChip sources={[e.source, ...e.duplicates]} variant="icon" className="size-5" />
    </li>
  );
}

/* ----------------------------------------------------------------- care -- */

function Care({ view, depth }: { view: FirmView; depth: Depth }) {
  const c = view.case;
  const [share, setShare] = useState(false);
  const opened = view.shares.filter((s) => s.openCount > 0).length;
  const start = c.treatment.dateOfIncident ?? c.matter.openDate;
  const scheduled = c.treatment.providers.flatMap((p) => p.points.filter((pt) => pt.kind === "scheduled").map((pt) => pt.date));
  const end = [c.today, ...scheduled].sort().at(-1)!;
  const span = Math.max(1, daysBetween(start, end));
  const x = (d: string) => `${Math.min(100, Math.max(0, (daysBetween(start, d) / span) * 100))}%`;
  const years: string[] = [];
  for (let y = Number(start.slice(0, 4)) + 1; y <= Number(end.slice(0, 4)); y++) years.push(`${y}-01-01`);

  return (
    <div>
      <div className="relative ml-[var(--care-label,11rem)] h-5 text-[11.5px] text-ink-soft max-sm:ml-[7rem]" aria-hidden>
        {years.map((y) => (
          <span key={y} className="tnum absolute -translate-x-1/2" style={{ left: x(y) }}>
            {y.slice(0, 4)}
          </span>
        ))}
        <span className="absolute -translate-x-full pr-1 text-signal" style={{ left: x(c.today) }}>
          Today
        </span>
      </div>
      <ul>
        {c.treatment.providers.map((row) => (
          <CareRow key={row.providerId} c={c} row={row} x={x} years={years} depth={depth} />
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-soft sm:pl-[var(--care-label,11rem)]">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-ink" aria-hidden />Visit</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-signal" aria-hidden />In produced records</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-[1.5px] border-ink" aria-hidden />Reported</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-[1.5px] border-dashed border-signal" aria-hidden />Scheduled</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-[2px]" style={{ backgroundImage: HATCH("var(--caution)"), backgroundColor: "var(--caution-wash)" }} aria-hidden />
          No record
        </span>
        {depth === 3 ? <ThresholdStepper setting="treatmentGapDays" value={c.thresholds.treatmentGapDays} label="Gap after" min={14} step={15} /> : <span>Gap after {c.thresholds.treatmentGapDays} days</span>}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-[13.5px] text-ink-soft">
          Providers get four answers and nothing else. {view.shares.length ? `${view.shares.length} shared so far, ${opened} opened.` : "Nothing shared yet."}
        </p>
        <button
          type="button"
          aria-expanded={share}
          onClick={() => setShare((o) => !o)}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-line-strong px-4 text-[13.5px] text-ink transition-[border-color,transform] duration-150 hover:border-ink active:scale-[0.97]"
        >
          {share ? <ArrowUpIcon size={14} aria-hidden /> : <ArrowDownIcon size={14} aria-hidden />}
          {share ? "Close sharing" : "Choose what each provider sees"}
        </button>
      </div>
      {share ? <ShareEditor className="mt-6" drafts={view.providerDrafts} shares={view.shares} previewHref={(id) => `/?role=provider&provider=${encodeURIComponent(id)}`} /> : null}
    </div>
  );
}

function CareRow({ c, row, x, years, depth }: { c: CaseFile; row: CaseFile["treatment"]["providers"][number]; x: (d: string) => string; years: string[]; depth: Depth }) {
  const p = c.providers.find((pp) => pp.id === row.providerId)!;
  const linked = useLinked({ providers: [row.providerId] });
  const handlers = useLinkHandlers([row.providerId]);
  const owes = c.tasks.waiting.filter((t) => t.providerIds.includes(row.providerId));
  const status = row.status === "scheduled" ? "Next visit booked" : row.status === "active" ? "Treating" : row.status === "inactive" ? "No recent record" : "No records";
  return (
    <li {...handlers} tabIndex={0} className={cn("a2-linkable grid grid-cols-[var(--care-label,11rem)_minmax(0,1fr)] items-center border-t border-line py-2.5 outline-offset-0 first:border-t-0 max-sm:grid-cols-[7rem_minmax(0,1fr)]", linked === "on" && "a2-on", linked === "off" && "a2-off")}>
      <div className="min-w-0 pr-3">
        <p className="truncate text-[13.5px] text-ink" title={p.name}>
          {p.shortName}
        </p>
        <p className={cn("truncate text-[12px]", row.status === "inactive" ? "text-caution" : "text-ink-soft")}>{depth === 3 ? `${p.specialty} · ${status}` : status}</p>
        {depth === 3 && owes.length ? <p className="truncate text-[12px] text-exposure">Owes: {owes.map((t) => t.title.toLowerCase()).join("; ")}</p> : null}
      </div>
      <div className="relative h-7" role="img" aria-label={`${p.shortName}: ${row.points.length} dated records of care, ${row.gaps.length} gaps over ${c.thresholds.treatmentGapDays} days${row.nextScheduled ? `, next visit ${fmtDate(row.nextScheduled)}` : ""}`}>
        <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
        {years.map((y) => (
          <div key={y} className="absolute inset-y-1 w-px bg-line" style={{ left: x(y) }} />
        ))}
        {row.gaps.map((g) => (
          <div
            key={`${g.from}-${g.to}`}
            title={`No dated record of care for ${g.days} days (${fmtDate(g.from)} to ${fmtDate(g.to)})`}
            className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-[2px]"
            style={{ left: x(g.from), width: `calc(${x(g.to)} - ${x(g.from)})`, backgroundImage: HATCH("var(--caution)"), backgroundColor: "var(--caution-wash)" }}
          />
        ))}
        {row.points.map((pt, i) => (
          <span
            key={`${pt.date}-${i}`}
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
}

/* ---------------------------------------------------------------- money -- */

function Money({ c, depth }: { c: CaseFile; depth: Depth }) {
  const s = c.specials;
  if (!s) return <p className="text-[14px] text-ink-soft">No itemised specials tally found in the file notes.</p>;
  const lines = depth === 3 ? s.lines : s.lines.slice(0, 5);
  const rest = s.lines.slice(lines.length);
  const max = Math.max(...s.lines.map((l) => l.amount));
  return (
    <div>
      <ul className="flex flex-col gap-2.5">
        {lines.map((l) => (
          <SpecialsLine key={l.label} c={c} l={l} max={max} uncertain={s.uncertainLabels.includes(l.label)} />
        ))}
      </ul>
      {rest.length ? (
        <p className="mt-3 text-[12.5px] text-ink-soft">
          and {rest.length} more lines, <span className="tnum text-ink">{fmtUsd(rest.reduce((n, l) => n + l.amount, 0))}</span>, when expanded
        </p>
      ) : null}
      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-soft">
        {s.uncertainLabels.length ? (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-[2px]" style={{ backgroundImage: HATCH("var(--caution)"), backgroundColor: "var(--caution-wash)" }} aria-hidden />
            Ledger unreconciled
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-signal" aria-hidden />
          Treating provider on file (hover to trace)
        </span>
        {s.coverage ? <span>Bills from {s.coverage.reported} of {s.coverage.of} providers</span> : null}
        <SourceChip sources={s.source} label={`Tally ${fmtDate(s.asOf)}`} />
        {c.kpis.specials?.interimReason ? <SourceChip sources={c.kpis.specials.interimReason} label="Why interim" /> : null}
      </p>
    </div>
  );
}

function SpecialsLine({ c, l, max, uncertain }: { c: CaseFile; l: NonNullable<CaseFile["specials"]>["lines"][number]; max: number; uncertain: boolean }) {
  const ids = l.providerId ? [l.providerId] : [];
  const linked = useLinked({ providers: ids });
  const handlers = useLinkHandlers(ids);
  const name = c.providers.find((p) => p.id === l.providerId)?.shortName;
  return (
    <li {...handlers} className={cn("a2-linkable grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1", linked === "on" && "a2-on", linked === "off" && "a2-off")}>
      <span className="min-w-0 truncate text-[13.5px] text-ink">
        {name ?? l.label}
        <span className="text-ink-soft"> · {name ? l.label : l.detail}</span>
      </span>
      <span className="tnum text-[13.5px] text-ink">{fmtUsd(l.amount)}</span>
      <div className="col-span-2 h-2 rounded-full bg-paper-2">
        <div
          className="h-full rounded-full"
          style={{
            width: `${(l.amount / max) * 100}%`,
            ...(uncertain ? { backgroundImage: HATCH("var(--caution)"), backgroundColor: "var(--caution-wash)" } : { background: l.providerId ? "var(--signal)" : "var(--ink)" }),
          }}
        />
      </div>
    </li>
  );
}

function MoneyMargin({ c }: { c: CaseFile }) {
  const k = c.kpis;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-ink-soft">Firm spend to date</p>
        <p className="flex items-center gap-1">
          <CountUp value={k.firmSpend.value} className="text-[18px] font-medium text-ink" />
          <SourceChip sources={k.firmSpend.items.map((i) => i.source)} variant="icon" className="size-5" />
        </p>
        <p>{k.firmSpend.count} expense entries</p>
      </div>
      <ul className="flex flex-col gap-1 border-t border-line pt-3">
        {k.coverage.lines.map((l) => (
          <li key={l.label} className="flex justify-between gap-3">
            <span>{l.label}</span>
            <span className="tnum text-ink">
              {l.perPerson !== null ? fmtUsd(l.perPerson, { compact: true }) : "?"}
              {l.perOccurrence ? ` / ${fmtUsd(l.perOccurrence, { compact: true })}` : ""}
              {k.noFault && /no-fault/i.test(l.label) && k.noFault.exhausted ? " · used up" : ""}
            </span>
          </li>
        ))}
        {k.liens.map((l) => (
          <li key={l.holder} className="flex justify-between gap-3">
            <span>{l.holder.replace(/^New York State /, "")} lien</span>
            <span className="tnum text-ink">{l.amount ? fmtUsd(l.amount) : "Amount unknown"}</span>
          </li>
        ))}
        {k.coverage.claimNumber ? (
          <li className="mt-1 flex items-center gap-1">
            Claim <span className="tnum text-ink">{k.coverage.claimNumber.value.split(" ")[0]}</span>
            <SourceChip sources={k.coverage.claimNumber.source} variant="icon" className="size-5" />
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------ liability -- */

function Liability({ c, depth }: { c: CaseFile; depth: Depth }) {
  const l = c.liability;
  const risks = depth === 3 ? l.risks : l.risks.slice(0, 3);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div>
        {l.crux ? (
          <blockquote className="border-l-2 border-exposure pl-5">
            <p className="font-[family-name:var(--font-display)] text-[1.4rem] italic leading-snug text-ink">“{l.crux.text}”</p>
            <SourceChip sources={l.crux.source} className="mt-3" />
          </blockquote>
        ) : null}
        {depth === 3 && l.mechanism ? (
          <p className="mt-6 text-[14px] leading-relaxed text-ink">
            <span className="text-ink-soft">As the client told it at intake: </span>
            {l.mechanism.text}
            <SourceChip sources={l.mechanism.source} variant="icon" className="size-5 align-middle" />
          </p>
        ) : null}
        {depth === 3 && l.adverse.length ? (
          <p className="mt-3 text-[13.5px] text-ink-soft">
            Adverse:{" "}
            {l.adverse.map((a, i) => (
              <span key={a.name}>
                <span className="text-ink">{a.name}</span> ({a.role.toLowerCase()}){i < l.adverse.length - 1 ? "; " : ""}
              </span>
            ))}
          </p>
        ) : null}
      </div>
      <div>
        <ul className="flex flex-col">
          {risks.map((r) => (
            <li key={r.id} className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-baseline gap-2 border-t border-line py-2 text-[13.5px] leading-snug">
              <span className="flex gap-0.5" aria-label={r.severity === 3 ? "High" : r.severity === 2 ? "Medium" : "Low"}>
                {[1, 2, 3].map((i) => (
                  <span key={i} className={cn("h-2.5 w-2 rounded-[1.5px]", i <= r.severity ? (r.severity === 3 ? "bg-exposure" : r.severity === 2 ? "bg-caution" : "bg-ink-soft") : "bg-line")} />
                ))}
              </span>
              <span className="text-ink">{r.label}</span>
              <SourceChip sources={r.sources} variant="icon" className="size-5" />
            </li>
          ))}
        </ul>
        {l.risks.length > risks.length ? <p className="mt-2 text-[12.5px] text-ink-soft">{l.risks.length - risks.length} lower risks when expanded</p> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- strength -- */

function Strength({ c, depth, weakest }: { c: CaseFile; depth: Depth; weakest: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const s = c.scorecard;
  return (
    <div>
      <ul className="divide-y divide-line border-y border-line">
        {s.factors.map((f) => {
          const expanded = depth === 3 || open === f.id;
          return (
            <li key={f.id}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(open === f.id ? null : f.id)}
                disabled={depth === 3}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto_4.5rem_1rem] items-center gap-4 py-3 text-left disabled:cursor-default"
              >
                <span className="flex items-center gap-2 text-[14.5px] text-ink">
                  {f.label} <span className="tnum text-[12.5px] text-ink-soft">· {f.weight}%</span>
                  {f.id === weakest ? <span className="rounded-full bg-exposure-wash px-2 py-0.5 text-[11px] font-medium text-exposure">Biggest drag</span> : null}
                </span>
                <span className="flex gap-1" aria-label={`${f.score} of 5`}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span key={i} className={cn("h-2.5 w-4 rounded-[2px]", f.score >= i ? "bg-ink" : f.score >= i - 0.5 ? "bg-ink/40" : "bg-line")} />
                  ))}
                </span>
                <span className="tnum text-right text-[13px] text-ink-soft">{f.score.toFixed(1)} / 5</span>
                <CaretDownIcon size={14} className={cn("text-ink-soft transition-transform duration-200", expanded && "rotate-180", depth === 3 && "opacity-0")} aria-hidden />
              </button>
              <AnimatePresence initial={false}>
                {expanded ? (
                  <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} className="flex flex-col gap-2 pb-4">
                    {f.evidence.length === 0 ? <li className="text-[13px] text-ink-soft">No evidence moved this factor from its base.</li> : null}
                    {f.evidence.map((ev, i) => (
                      <li key={i} className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-baseline gap-2 text-[13px] leading-snug">
                        <span className={cn("tnum font-medium", ev.delta >= 0 ? "text-good" : "text-exposure")}>
                          {ev.delta >= 0 ? "+" : "−"}
                          {Math.abs(ev.delta).toFixed(2).replace(/0$/, "")}
                        </span>
                        <span className="text-ink">{ev.text}</span>
                        <SourceChip sources={ev.sources} variant="icon" className="size-5" />
                      </li>
                    ))}
                  </motion.ul>
                ) : null}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      <div className="mt-3">
        <DerivedNote kind="rules" title="How the score works">
          {s.method}
        </DerivedNote>
      </div>
    </div>
  );
}

