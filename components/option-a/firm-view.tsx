"use client";

import { useGSAP } from "@gsap/react";
import { ArrowDownIcon, ArrowUpIcon, CaretDownIcon, CheckCircleIcon, ClockCountdownIcon, PhoneIcon, EnvelopeSimpleIcon } from "@phosphor-icons/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef, useState } from "react";
import { CountUp, DerivedNote, GeneratedLine, NewMark, Portrait } from "@/components/case/atoms";
import { canAnimate } from "@/components/case/motion";
import { ConflictFlag, LastVisitDemo, ThresholdStepper } from "@/components/case/controls";
import { ShareEditor } from "@/components/case/share-editor";
import { KIND_ICON, SourceChip } from "@/components/case/sources";
import { CoverageGauge, SpecialsBars, StageTrack, TreatmentRibbon } from "@/components/case/viz";
import type { FirmView } from "@/lib/access";
import type { CaseFile, RankedEvent } from "@/lib/derive";
import { capitalize, fmtDate, fmtUsd, relDays } from "@/lib/format";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Option A, Briefing. A single editorial column with a right rail. The lede
 * reads like the top of a news story; sources are footnote markers. Motion:
 * one composed entrance (portrait, KPIs, lede, rest), a self-drawing
 * timeline, and bars that fill once. Library: GSAP, because the entrance is a
 * sequenced timeline and the timeline draw is scroll-triggered.
 */

const H2 = "font-[family-name:var(--font-display)] text-[clamp(1.6rem,1.2rem+1vw,2.1rem)] font-medium leading-[1.15] tracking-[-0.015em] text-ink";
const H3 = "text-[15px] font-semibold text-ink";

export function BriefingFirm({ view }: { view: FirmView & { digestPending: boolean } }) {
  const c = view.case;
  const root = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add({ motion: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
        const shell = root.current?.closest(".reveal-root");
        const done = () => shell?.classList.add("revealed");
        if (ctx.conditions?.reduce || !canAnimate()) {
          done();
          return;
        }
        // Hierarchy: who → money → what happened → everything else.
        const tl = gsap.timeline({ defaults: { ease: "expo.out", duration: 0.7 }, onComplete: done });
        tl.fromTo("[data-reveal='portrait']", { autoAlpha: 1, clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.75, ease: "power3.inOut" })
          .fromTo("[data-reveal='name']", { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0 }, "<0.15")
          .fromTo("[data-reveal='kpi']", { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, stagger: 0.07 }, "<0.1")
          .fromTo("[data-reveal='gauge']", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, "<0.1")
          .fromTo("[data-reveal='gauge'] [data-bar]", { scaleX: 0 }, { scaleX: 1, duration: 0.9 }, "<")
          .fromTo("[data-reveal='gauge'] [data-gap]", { scaleX: 0 }, { scaleX: 1, duration: 0.8 }, ">-0.45")
          .fromTo("[data-reveal='lede']", { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, stagger: 0.08 }, "<-0.5")
          .fromTo("[data-reveal='rest']", { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, stagger: 0.05, duration: 0.6 }, "<0.15");

        // The story draws itself as it arrives.
        gsap.set("[data-timeline-line]", { scaleY: 0, transformOrigin: "top" });
        gsap.set("[data-timeline-item]", { autoAlpha: 0, x: -6 });
        ScrollTrigger.create({
          trigger: "[data-timeline]",
          start: "top 78%",
          once: true,
          onEnter: () => {
            gsap.to("[data-timeline-line]", { scaleY: 1, duration: 0.9, ease: "power2.inOut" });
            gsap.to("[data-timeline-item]", { autoAlpha: 1, x: 0, stagger: 0.055, duration: 0.5, ease: "expo.out", delay: 0.08 });
          },
        });

        gsap.utils.toArray<HTMLElement>("[data-bars]").forEach((el) => {
          const bars = el.querySelectorAll("[data-bar], [data-gap]");
          gsap.set(bars, { scaleX: 0, transformOrigin: "left center" });
          ScrollTrigger.create({
            trigger: el,
            start: "top 82%",
            once: true,
            onEnter: () => gsap.to(bars, { scaleX: 1, duration: 0.8, stagger: 0.04, ease: "expo.out" }),
          });
        });
        return done;
      });
    },
    { scope: root },
  );

  const conflictFor = (anchor: string) => c.conflicts.filter((x) => x.anchor === anchor);
  const digestKind = c.digest.generator.kind === "ai" ? "ai" : "rules";

  return (
    <div ref={root} className="mx-auto max-w-[78rem] px-4 pb-24 sm:px-8">
      {/* ------------------------------------------------------- glance -- */}
      <section aria-labelledby="client-name" className="grid gap-10 pt-10 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-14 lg:pt-14">
        <div>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <div data-reveal="portrait" className="shrink-0">
              <Portrait
                name={c.client.name}
                photo={view.photo ?? c.client.avatarUrl}
                editable
                className="h-[10.5rem] w-[8.5rem] rounded-[3px] ring-1 ring-line"
                initialsClassName="font-[family-name:var(--font-display)] text-[3.25rem] font-light tracking-[-0.02em]"
              />
            </div>
            <div data-reveal="name" className="min-w-0">
              <h1 id="client-name" className="font-[family-name:var(--font-display)] text-[clamp(2.75rem,2rem+3vw,4.5rem)] font-normal leading-[0.98] tracking-[-0.025em] text-ink">
                {c.client.name}
              </h1>
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[15px] text-ink-soft">
                <span className="text-ink">{c.matter.caseType || c.matter.practiceArea}</span>
                <span aria-hidden>·</span>
                {c.matter.dateOfIncident ? (
                  <>
                    <span>
                      Incident <span className="tnum text-ink">{fmtDate(c.matter.dateOfIncident.value)}</span>
                    </span>
                    <SourceChip sources={c.matter.dateOfIncident.source} variant="icon" className="size-5" />
                  </>
                ) : (
                  <span>No incident date in Clio</span>
                )}
              </p>
              <div className="mt-4 max-w-[30rem]">
                <StageTrack stages={c.matter.stagesInOrder} current={c.matter.stage} />
              </div>
            </div>
          </div>

          <div className="mt-10 max-w-[44rem]">
            <h2 className="sr-only">The case in brief</h2>
            <p className="sync-skel font-[family-name:var(--font-display)] text-[clamp(1.2rem,1.05rem+0.5vw,1.45rem)] leading-[1.55] text-ink [font-variation-settings:'opsz'_24]">
              <span>
                {c.digest.sentences.map((s, i) => (
                  <span key={i} data-reveal="lede">
                    {s.text}
                    <SourceChip sources={s.sources} variant="footnote" footnote={i + 1} />{" "}
                  </span>
                ))}
              </span>
            </p>
            <div data-reveal="lede" className="mt-4 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-soft">
              <DerivedNote kind={digestKind} title="How this summary was written" sources={c.digest.sentences.flatMap((s) => s.sources)}>
                {digestKind === "ai"
                  ? "Written once by the model from the derived facts below and cached until the Clio data changes. Every sentence cites the records it rests on; uncited sentences are dropped."
                  : "Assembled from Clio fields (case summary, stage, treatment status, value and limits) and the procedures found in the calendar and notes. It is regenerated only when the Clio data changes."}
              </DerivedNote>
              <GeneratedLine itemCount={c.digest.itemCount} generatedAt={c.digest.generatedAt} generator={c.digest.generator} />
              {view.digestPending ? <span className="sync-pulse">· AI digest generating</span> : null}
            </div>
            <NeedsYouNow c={c} />
          </div>
        </div>

        {/* Rail: the money, then what changed. */}
        <aside className="flex flex-col gap-8 lg:border-l lg:border-line lg:pl-10" aria-label="Key figures">
          <MoneyRail c={c} />
          <ChangeFeed c={c} />
        </aside>
      </section>

      {/* ---------------------------------------------------------- act -- */}
      <section aria-labelledby="act-h" className="mt-16 border-t border-ink pt-8">
        <h2 id="act-h" data-reveal="rest" className={H2}>
          What needs you
        </h2>
        <div className="mt-7 grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.4fr)_minmax(0,0.85fr)] lg:gap-10">
          <Deadlines c={c} />
          <Tasks c={c} conflictFor={conflictFor} />
          <ClientContact c={c} />
        </div>
      </section>

      {/* -------------------------------------------------------- story -- */}
      <section aria-labelledby="story-h" className="mt-16 border-t border-ink pt-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-14">
          <div>
            <h2 id="story-h" className={H2}>
              The story so far
            </h2>
            <p className="mt-2 max-w-[38rem] text-[14.5px] leading-relaxed text-ink-soft">
              The ten moments that shaped this file, ranked from {c.events.length} records and told in order. Each says why it made the cut.
            </p>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-soft" aria-hidden>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-exposure" />Liability</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-signal" />Medical</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-ink" />Legal and coverage</span>
            </p>
            <Timeline c={c} />
            <div className="mt-6">
              <button
                type="button"
                aria-expanded={showAll}
                onClick={() => setShowAll((v) => !v)}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-line-strong px-4 text-[13.5px] text-ink transition-[border-color,transform] duration-150 hover:border-ink active:scale-[0.97]"
              >
                {showAll ? <ArrowUpIcon size={14} aria-hidden /> : <ArrowDownIcon size={14} aria-hidden />}
                {showAll ? "Hide the full chronology" : `Show the full chronology (${c.events.length} records)`}
              </button>
              {showAll ? <Chronology c={c} /> : null}
            </div>
          </div>
          <aside className="flex flex-col gap-8" aria-label="Open questions and checks">
            <OpenQuestions c={c} />
            <Checks c={c} />
          </aside>
        </div>
      </section>

      <section aria-labelledby="injury-h" className="mt-16 border-t border-line pt-8">
        <h2 id="injury-h" className={H2}>
          Injuries and treatment
        </h2>
        <Injuries c={c} />
        <div className="mt-10" data-bars>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className={H3}>Who has been treating the client, and when</h3>
            <ThresholdStepper setting="treatmentGapDays" value={c.thresholds.treatmentGapDays} label="Gap after" min={14} step={15} />
          </div>
          <p className="mt-1 max-w-[42rem] text-[13.5px] leading-relaxed text-ink-soft">
            Each mark is a dated record of care. Hatched stretches are gaps with no record, which is how defense counsel will read them.
          </p>
          <TreatmentRibbon c={c} className="mt-4 [--ribbon-label:10.5rem]" />
        </div>
      </section>

      <section className="mt-16 grid gap-14 border-t border-line pt-8 lg:grid-cols-2">
        <div data-bars aria-labelledby="specials-h">
          <h2 id="specials-h" className={H2}>
            Medical specials
          </h2>
          {c.kpis.specials ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[15px] text-ink-soft">
              <span className="sync-skel">
                <CountUp value={c.kpis.specials.value} className="text-[22px] font-medium text-ink" />
              </span>
              <SourceChip sources={c.kpis.specials.source} variant="icon" />
              {c.kpis.specials.interim ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-caution-wash px-2 py-0.5 text-[12px] font-medium text-caution">
                  Interim
                  <SourceChip sources={c.kpis.specials.interimReason} variant="icon" className="size-5 text-caution" />
                </span>
              ) : null}
            </p>
          ) : null}
          <SpecialsBars c={c} className="mt-6" />
        </div>
        <Liability c={c} />
      </section>

      <section className="mt-16 border-t border-line pt-8" aria-labelledby="share-h">
        <ProviderSharing view={view} />
      </section>

      <section className="mt-16 border-t border-ink pt-8" aria-labelledby="score-h">
        <Scorecard c={c} />
      </section>

      <footer className="mt-20 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[12.5px] leading-relaxed text-ink-soft">
        <span>Read-only from Clio Manage. Our database holds only the sharing log, provider visibility, last-opened times, cached digests and the client photo.</span>
        <LastVisitDemo />
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------- pieces -- */

function MoneyRail({ c }: { c: CaseFile }) {
  const v = c.kpis.estimatedValue;
  const lim = c.kpis.coverage.defendantLimit;
  const gap = c.kpis.coverage.gap;
  const coverageFlag = c.conflicts.find((x) => x.anchor === "coverage");
  return (
    <div className="flex flex-col gap-5">
      {gap && gap.value > 0 ? (
        <div data-reveal="kpi">
          <p className="text-[13px] text-ink-soft">Exposure above the recorded coverage</p>
          <p className="mt-0.5 flex items-baseline gap-1">
            <span className="sync-skel">
              <CountUp value={gap.value} className="font-[family-name:var(--font-display)] text-[3rem] leading-none tracking-[-0.025em] text-exposure" />
            </span>
            <DerivedNote kind="derived" className="ml-1.5 self-center" sources={[gap.source, ...(gap.also ?? [])]}>
              {gap.derivation}
              {c.kpis.liens.length ? ` The ${c.kpis.liens.map((l) => `${l.holder} lien${l.amount ? ` (${fmtUsd(l.amount)})` : ""}`).join(", ")} comes off any recovery.` : ""}
            </DerivedNote>
          </p>
        </div>
      ) : null}
      <div data-reveal="kpi" className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[13px] text-ink-soft">Estimated value</p>
          {v ? (
            <p className="mt-0.5 flex items-baseline gap-1">
              <span className="sync-skel">
                <CountUp value={v.value} delay={80} className="font-[family-name:var(--font-display)] text-[1.75rem] leading-none tracking-[-0.02em] text-ink" />
              </span>
              <SourceChip sources={[v.source, ...(v.also ?? [])]} variant="icon" className="size-5" />
            </p>
          ) : (
            <p className="mt-1 text-[14px] text-ink-soft">Not set in Clio</p>
          )}
        </div>
        <div>
          <p className="text-[13px] text-ink-soft">Per-person limit</p>
          {lim ? (
            <p className="mt-0.5 flex items-baseline gap-1">
              <span className="sync-skel">
                <CountUp value={lim.value} delay={160} className="font-[family-name:var(--font-display)] text-[1.75rem] leading-none tracking-[-0.02em] text-ink" />
              </span>
              <SourceChip sources={[lim.source, ...(lim.also ?? [])]} variant="icon" className="size-5" />
            </p>
          ) : (
            <p className="mt-1 text-[14px] text-ink-soft">No limit recorded</p>
          )}
        </div>
      </div>
      <div data-reveal="gauge">
        <CoverageGauge c={c} />
        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-soft">
          {c.kpis.coverage.confirmed ? (
            <span className="inline-flex items-center gap-1 text-good">
              <CheckCircleIcon size={13} weight="fill" aria-hidden /> Confirmed in writing
            </span>
          ) : (
            <span className="text-caution">Limit not confirmed</span>
          )}
          {coverageFlag ? (
            <>
              <span aria-hidden>·</span>
              <ConflictFlag conflict={coverageFlag} label="1 record disagrees" />
            </>
          ) : null}
        </p>
      </div>
      <div data-reveal="kpi" className="flex items-baseline justify-between gap-3 border-t border-line pt-4">
        <p className="text-[13px] text-ink-soft">Firm spend to date</p>
        <p className="flex items-baseline gap-1">
          <span className="sync-skel">
            <CountUp value={c.kpis.firmSpend.value} delay={240} className="text-[18px] font-medium text-ink" />
          </span>
          <SourceChip sources={c.kpis.firmSpend.items.map((i) => i.source)} variant="icon" className="size-5" />
        </p>
      </div>
      {c.kpis.coverage.lines.length > 1 ? (
        <ul data-reveal="kpi" className="flex flex-col gap-1 text-[12.5px] text-ink-soft">
          {c.kpis.coverage.lines.slice(1).map((l) => (
            <li key={l.label} className="flex justify-between gap-3">
              <span>{l.label}</span>
              <span className="tnum">
                {fmtUsd(l.perPerson!)}
                {l.perOccurrence ? ` / ${fmtUsd(l.perOccurrence)}` : ""}
                {c.kpis.noFault && /no-fault/i.test(l.label) && c.kpis.noFault.exhausted ? " · exhausted" : ""}
              </span>
            </li>
          ))}
          {c.kpis.liens.map((l) => (
            <li key={l.holder} className="flex justify-between gap-3">
              <span>{l.holder.replace(/^New York State /, "")} lien</span>
              <span className="tnum">{l.amount ? fmtUsd(l.amount) : "Amount unknown"}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The three things to act on today, right under the lede. */
function NeedsYouNow({ c }: { c: CaseFile }) {
  const overdue = c.tasks.overdue[0];
  const next = [...c.tasks.comingUp].filter((t) => t.due)[0];
  const cc = c.clientContact;
  return (
    <ul data-reveal="lede" className="mt-8 grid gap-px overflow-hidden rounded-[4px] border border-line bg-line text-[13.5px] sm:grid-cols-3" aria-label="Needs you now">
      <li className="bg-card-bg px-4 py-3">
        <p className="text-[12.5px] text-ink-soft">Overdue</p>
        {overdue ? (
          <p className="mt-0.5 leading-snug text-ink">
            {overdue.title} <span className="tnum whitespace-nowrap text-exposure">({relDays(overdue.daysUntilDue)})</span>
          </p>
        ) : (
          <p className="mt-0.5 text-ink">Nothing overdue</p>
        )}
      </li>
      <li className="bg-card-bg px-4 py-3">
        <p className="text-[12.5px] text-ink-soft">Next due</p>
        {next ? (
          <p className="mt-0.5 leading-snug text-ink">
            {next.title} <span className="tnum whitespace-nowrap text-ink-soft">({relDays(next.daysUntilDue)})</span>
          </p>
        ) : (
          <p className="mt-0.5 text-ink">Nothing scheduled</p>
        )}
      </li>
      <li className="bg-card-bg px-4 py-3">
        <p className="text-[12.5px] text-ink-soft">Last client contact</p>
        <p className={cn("mt-0.5 leading-snug", cc.stale ? "text-exposure" : "text-ink")}>
          {cc.last ? `${cc.last.daysAgo} days ago, by ${cc.last.channel}` : "None logged"}
        </p>
      </li>
    </ul>
  );
}

function ProviderSharing({ view }: { view: FirmView }) {
  const [open, setOpen] = useState(false);
  const opened = view.shares.filter((s) => s.openCount > 0).length;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="share-h" className={H2}>
            What each provider sees
          </h2>
          <p className="mt-2 max-w-[42rem] text-[14.5px] leading-relaxed text-ink-soft">
            Providers get four answers and nothing else.{" "}
            {view.shares.length ? `${view.shares.length} shared so far, ${opened} opened.` : "Nothing shared yet."}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-line-strong px-4 text-[13.5px] text-ink transition-[border-color,transform] duration-150 hover:border-ink active:scale-[0.97]"
        >
          {open ? <ArrowUpIcon size={14} aria-hidden /> : <ArrowDownIcon size={14} aria-hidden />}
          {open ? "Close sharing" : "Manage provider sharing"}
        </button>
      </div>
      {open ? <ShareEditor className="mt-6" drafts={view.providerDrafts} shares={view.shares} previewHref={(id) => `/option-a?role=provider&provider=${encodeURIComponent(id)}`} /> : null}
    </div>
  );
}

function ChangeFeed({ c }: { c: CaseFile }) {
  const { changes } = c;
  return (
    <div data-reveal="rest">
      <h2 className="text-[15px] font-semibold text-ink">What changed since you last opened it</h2>
      <p className="mt-0.5 text-[12.5px] text-ink-soft">
        {changes.firstVisit ? "First visit: showing the last two weeks." : <>Since <span className="tnum">{fmtDate(changes.since)}</span></>}
      </p>
      <ul aria-live="polite" className="mt-3 flex flex-col gap-3">
        {changes.items.length === 0 ? <li className="text-[13.5px] text-ink-soft">Nothing new in Clio since then.</li> : null}
        {changes.items.slice(0, 4).map((e) => {
          return (
            <li key={e.id}>
              <NewMark isNew className="flex gap-2.5">
                <div className="min-w-0">
                  <p className="text-[13.5px] leading-snug text-ink">{e.title}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-soft">
                    <span className="tnum">{fmtDate(e.date, { year: false })}</span>
                    {e.reason && e.reason !== "Follow-up" ? <span>· {e.reason}</span> : null}
                    <SourceChip sources={e.source} variant="icon" className="size-5" />
                  </p>
                </div>
              </NewMark>
            </li>
          );
        })}
      </ul>
      {changes.items.length > 4 ? <p className="mt-2 text-[12.5px] text-ink-soft">and {changes.items.length - 4} more in the chronology</p> : null}
    </div>
  );
}

function Deadlines({ c }: { c: CaseFile }) {
  const sol = c.sol;
  return (
    <div data-reveal="rest">
      <h3 className={H3}>Key deadlines</h3>
      <ul className="mt-3 flex flex-col divide-y divide-line">
        <li className="pb-3">
          <div className="flex items-start gap-2.5">
            {sol.status === "satisfied" ? (
              <CheckCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-good" aria-hidden />
            ) : (
              <ClockCountdownIcon size={18} className={cn("mt-0.5 shrink-0", sol.status === "expired" ? "text-exposure" : "text-caution")} aria-hidden />
            )}
            <div className="min-w-0">
              <p className="text-[14px] text-ink">
                Statute of limitations{" "}
                <span className={cn("font-medium", sol.status === "satisfied" ? "text-good" : sol.status === "expired" ? "text-exposure" : "text-caution")}>
                  {sol.status === "satisfied" ? "satisfied" : sol.status === "expired" ? "expired" : relDays(sol.daysUntil)}
                </span>
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-soft">
                <span className="tnum">{fmtDate(sol.date)}</span>
                <SourceChip sources={sol.sources} variant="icon" className="size-5" />
              </p>
              {sol.status === "satisfied" ? <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{sol.explanation.split(/(?<=\.)\s/).slice(1, 2).join(" ") || sol.explanation}</p> : null}
            </div>
          </div>
        </li>
        {c.deadlines.filter((d) => d.kind !== "treatment").slice(0, 5).map((d) => (
          <li key={d.id} className="flex items-baseline gap-3 py-2.5">
            <span className="tnum w-[3.6rem] shrink-0 text-[13px] text-ink-soft">{fmtDate(d.date, { year: false })}</span>
            <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink">{d.title}</span>
            <SourceChip sources={d.source} variant="icon" className="size-5" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tasks({ c, conflictFor }: { c: CaseFile; conflictFor: (id: string) => CaseFile["conflicts"] }) {
  const col = (title: string, items: CaseFile["tasks"]["overdue"], tone: "exposure" | "ink" | "caution", empty: string) => (
    <div>
      <p className="flex items-baseline gap-2 text-[13px] text-ink-soft">
        <span className={cn("tnum text-[22px] font-medium leading-none", tone === "exposure" ? "text-exposure" : tone === "caution" ? "text-caution" : "text-ink")}>{items.length}</span>
        {title}
      </p>
      <ul className="mt-2.5 flex flex-col gap-3">
        {items.length === 0 ? <li className="text-[13px] text-ink-soft">{empty}</li> : null}
        {items.map((t) => (
          <li key={t.id} className="text-[13.5px] leading-snug">
            <p className="text-ink">{t.waitingOn ? <span className="font-medium">{t.waitingOn.replace(/,?\s*(P\.C\.|PLLC)$/, "")}: </span> : null}{t.title}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-soft">
              <span className={cn("tnum", (t.daysUntilDue ?? 0) < 0 && "text-exposure")}>
                {t.due ? `${fmtDate(t.due, { year: false })}, ${relDays(t.daysUntilDue)}` : "No due date"}
              </span>
              <SourceChip sources={t.source} variant="icon" className="size-5" />
              {conflictFor(t.id).map((x) => (
                <ConflictFlag key={x.id} conflict={x} />
              ))}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div data-reveal="rest">
      <h3 className={H3}>Tasks</h3>
      <div className="mt-3 grid gap-7 sm:grid-cols-3 sm:gap-6">
        {col("overdue", c.tasks.overdue, "exposure", "Nothing overdue.")}
        {col("coming up", c.tasks.comingUp, "ink", "Nothing scheduled.")}
        {col("waiting on others", c.tasks.waiting, "caution", "Not waiting on anyone.")}
      </div>
    </div>
  );
}

function ClientContact({ c }: { c: CaseFile }) {
  const cc = c.clientContact;
  const Channel = cc.last?.channel === "phone" ? PhoneIcon : EnvelopeSimpleIcon;
  return (
    <div data-reveal="rest">
      <h3 className={H3}>Last client contact</h3>
      {cc.last ? (
        <div className="mt-3">
          <p className="flex items-baseline gap-2">
            <span className="tnum font-[family-name:var(--font-display)] text-[1.9rem] leading-none text-ink">{fmtDate(cc.last.date, { year: false })}</span>
            <span className={cn("text-[13px]", cc.stale ? "font-medium text-exposure" : "text-ink-soft")}>{cc.last.daysAgo} days ago</span>
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-ink-soft">
            <Channel size={14} aria-hidden />
            {cc.last.direction === "inbound" ? "Client called" : capitalize(cc.last.channel === "phone" ? "call" : "email")}: {cc.last.subject}
            <SourceChip sources={cc.last.source} variant="icon" className="size-5" />
          </p>
          {cc.stale ? (
            <p className="mt-2 rounded-[4px] bg-exposure-wash px-2.5 py-1.5 text-[12.5px] text-exposure">Longer than {cc.thresholdDays} days. Time to call.</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-[13.5px] text-exposure">No client communication logged in Clio.</p>
      )}
      <ThresholdStepper className="mt-3" setting="clientContactStaleDays" value={cc.thresholdDays} label="Flag after" />
      {cc.nextScheduled ? (
        <p className="mt-3 text-[12.5px] text-ink-soft">
          Next: <span className="tnum text-ink">{fmtDate(cc.nextScheduled.date, { year: false })}</span>, {cc.nextScheduled.title.toLowerCase()}
        </p>
      ) : null}
    </div>
  );
}

function Timeline({ c }: { c: CaseFile }) {
  const reasonFor = (e: RankedEvent) => c.digest.reasons?.[e.id] ?? e.reason;
  return (
    <ol data-timeline className="relative mt-8">
      <span data-timeline-line aria-hidden className="absolute bottom-2 left-[5.25rem] top-2 w-px bg-ink sm:left-[6.75rem]" />
      {c.topEvents.map((e) => (
        <li key={e.id} data-timeline-item className="relative grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-6 pb-7 sm:grid-cols-[6rem_minmax(0,1fr)]">
          <span className="tnum pt-0.5 text-right text-[13px] leading-tight text-ink-soft">
            {fmtDate(e.date, { year: false })}
            <br />
            <span className="text-[12px]">{e.date.slice(0, 4)}</span>
          </span>
          <span aria-hidden className={cn("absolute left-[5.25rem] top-1.5 size-2.5 -translate-x-1/2 rounded-full ring-4 ring-paper sm:left-[6.75rem]", e.category === "liability" ? "bg-exposure" : e.category === "medical" ? "bg-signal" : "bg-ink")} />
          <div className="min-w-0 pl-1">
            <p className="font-[family-name:var(--font-display)] text-[1.15rem] leading-snug text-ink">{e.title}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-soft">
              <span className="font-medium text-ink">{reasonFor(e)}</span>
              <SourceChip sources={[e.source, ...e.duplicates]} />
              {e.related.length ? <span>{e.related.length} related record{e.related.length > 1 ? "s" : ""}</span> : null}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Chronology({ c }: { c: CaseFile }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!canAnimate()) return;
      gsap.from("[data-year]", { autoAlpha: 0, y: 8, stagger: 0.05, duration: 0.45, ease: "expo.out" });
    },
    { scope: ref },
  );
  const years = [...new Set(c.events.map((e) => e.date.slice(0, 4)))];
  return (
    <div ref={ref} className="mt-6 flex flex-col gap-6">
      {years.map((y) => (
        <section key={y} data-year aria-label={y}>
          <h3 className="tnum font-[family-name:var(--font-display)] text-[1.5rem] text-ink">{y}</h3>
          <ul className="mt-2 divide-y divide-line">
            {c.events
              .filter((e) => e.date.startsWith(y))
              .map((e) => {
                const I = KIND_ICON[e.source.kind];
                const upcoming = e.date > c.today;
                return (
                  <li key={e.id} className="grid grid-cols-[3.75rem_1.25rem_minmax(0,1fr)_auto] items-baseline gap-2 py-2">
                    <span className="tnum text-[12.5px] text-ink-soft">{fmtDate(e.date, { year: false })}</span>
                    <I size={14} className="translate-y-0.5 text-ink-soft" aria-hidden />
                    <span className="min-w-0 text-[13.5px] leading-snug text-ink">
                      {e.title}
                      {upcoming ? <span className="ml-2 text-[12px] text-signal">Upcoming</span> : null}
                      {e.reason && e.ruleId !== "chaser" ? <span className="ml-2 text-[12px] text-ink-soft">{e.reason}</span> : null}
                    </span>
                    <SourceChip sources={[e.source, ...e.duplicates]} variant="icon" className="size-5" />
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function OpenQuestions({ c }: { c: CaseFile }) {
  const open = c.treatment.procedures.filter((p) => p.status === "recommended" && p.openForDays !== null);
  if (!open.length) return null;
  return (
    <div>
      <h3 className={H3}>The open question</h3>
      {open.map((p) => (
        <div key={p.label} className="mt-3 border-t-2 border-exposure pt-3">
          <p className="font-[family-name:var(--font-display)] text-[1.35rem] leading-snug text-ink">
            {capitalize(p.label)} recommended <span className="tnum">{fmtDate(p.date)}</span>, still undated.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            Open for <span className="tnum text-ink">{p.openForDays}</span> days, with <span className="tnum text-ink">{p.followUps}</span> written or phone approaches to the surgeon&apos;s office since. Specials and value can&apos;t close until it is scheduled.
          </p>
          <div className="mt-2.5">
            <SourceChip sources={[p.source, ...p.also]} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Checks({ c }: { c: CaseFile }) {
  if (!c.conflicts.length) return null;
  return (
    <div>
      <h3 className={H3}>Records that disagree</h3>
      <ul className="mt-3 flex flex-col gap-3">
        {c.conflicts.map((x) => (
          <li key={x.id} className="text-[13px] leading-relaxed">
            <ConflictFlag conflict={x} label={x.title} />
            <p className="mt-1.5 text-ink-soft">{x.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Injuries({ c }: { c: CaseFile }) {
  return (
    <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {c.treatment.injuries.map((inj) => (
          <div key={inj.region}>
            <dt className="flex items-center gap-2 text-[14.5px] font-medium text-ink">
              {inj.region}
              <SourceChip sources={inj.claimedIn} variant="icon" className="size-5" />
            </dt>
            {inj.imaging.length ? (
              inj.imaging.map((s) => (
                <dd key={s.study} className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                  <span className="text-ink">{s.study}</span>
                  {s.date ? <span className="tnum">, {fmtDate(s.date)}</span> : null}: {s.finding}
                </dd>
              ))
            ) : (
              <dd className="mt-1 text-[13px] text-ink-soft">Claimed; no imaging summary in the notes.</dd>
            )}
          </div>
        ))}
      </dl>
      <div>
        <h3 className={H3}>Procedures</h3>
        <ul className="mt-3 flex flex-col gap-3">
          {c.treatment.procedures.map((p) => (
            <li key={p.label} className="flex items-start gap-2.5">
              {p.status === "performed" ? <CheckCircleIcon size={17} weight="fill" className="mt-0.5 shrink-0 text-ink" aria-hidden /> : <ClockCountdownIcon size={17} className="mt-0.5 shrink-0 text-exposure" aria-hidden />}
              <div className="text-[13.5px] leading-snug">
                <p className="text-ink">{capitalize(p.label)}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-soft">
                  {p.status === "performed" ? <>Performed <span className="tnum">{fmtDate(p.date)}</span></> : <>Recommended <span className="tnum">{fmtDate(p.date)}</span>, no date yet</>}
                  <SourceChip sources={[p.source, ...p.also]} variant="icon" className="size-5" />
                </p>
              </div>
            </li>
          ))}
        </ul>
        {c.treatment.statusText ? (
          <p className="mt-5 flex items-start gap-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            <span>“{c.treatment.statusText.value}”</span>
            <SourceChip sources={c.treatment.statusText.source} variant="footnote" />
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Liability({ c }: { c: CaseFile }) {
  const l = c.liability;
  return (
    <div aria-labelledby="liability-h">
      <h2 id="liability-h" className={H2}>
        Liability
      </h2>
      {l.mechanism ? (
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink">
          <span className="text-ink-soft">As the client told it at intake: </span>
          {l.mechanism.text}
          <SourceChip sources={l.mechanism.source} variant="footnote" />
        </p>
      ) : null}
      {l.adverse.length ? (
        <p className="mt-3 text-[13.5px] text-ink-soft">
          Adverse:{" "}
          {l.adverse.map((a, i) => (
            <span key={a.name}>
              <span className="text-ink">{a.name}</span> ({a.role.toLowerCase()})
              {i < l.adverse.length - 1 ? "; " : ""}
            </span>
          ))}
        </p>
      ) : null}
      {l.crux ? (
        <blockquote className="mt-6 border-y border-line py-5">
          <p className="text-[13px] font-medium text-exposure">{l.crux.question} decides the case</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-[1.35rem] italic leading-snug text-ink">“{l.crux.text}”</p>
          <SourceChip sources={l.crux.source} className="mt-3" />
        </blockquote>
      ) : null}
      <h3 className={cn(H3, "mt-6")}>Risks in the file</h3>
      <ul className="mt-2.5 flex flex-col gap-2.5">
        {l.risks.map((r) => (
          <li key={r.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-baseline gap-2 text-[13.5px] leading-snug">
            <span className={cn("text-[12px] font-medium", r.severity === 3 ? "text-exposure" : r.severity === 2 ? "text-caution" : "text-ink-soft")}>
              {r.severity === 3 ? "High" : r.severity === 2 ? "Medium" : "Low"}
            </span>
            <span className="text-ink">{r.label}</span>
            <SourceChip sources={r.sources} variant="icon" className="size-5" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Scorecard({ c }: { c: CaseFile }) {
  const [open, setOpen] = useState<string | null>(null);
  const s = c.scorecard;
  return (
    <div className="grid gap-10 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-14">
      <div>
        <h2 id="score-h" className={H2}>
          Case strength
        </h2>
        <p className="mt-3 flex items-baseline gap-1">
          <span className="sync-skel">
            <CountUp value={s.total} format={(n) => Math.round(n).toString()} className="font-[family-name:var(--font-display)] text-[4.5rem] leading-none tracking-[-0.03em] text-ink" />
          </span>
          <span className="text-[18px] text-ink-soft">/100</span>
        </p>
        <div className="mt-3">
          <DerivedNote kind="rules" title="How the score works">
            {s.method}
          </DerivedNote>
        </div>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {s.factors.map((f) => {
          const expanded = open === f.id;
          return (
            <li key={f.id}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : f.id)}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto_5.5rem_1rem] items-center gap-4 py-3.5 text-left"
              >
                <span className="text-[14.5px] text-ink">
                  {f.label} <span className="tnum text-[12.5px] text-ink-soft">· weight {f.weight}%</span>
                </span>
                <span className="flex gap-1" aria-label={`${f.score} of 5`}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span key={i} className={cn("h-2.5 w-4 rounded-[2px]", f.score >= i ? "bg-ink" : f.score >= i - 0.5 ? "bg-ink/40" : "bg-line")} />
                  ))}
                </span>
                <span className="tnum text-right text-[13px] text-ink-soft">{f.score.toFixed(1)} / 5</span>
                <CaretDownIcon size={14} className={cn("text-ink-soft transition-transform duration-200", expanded && "rotate-180")} aria-hidden />
              </button>
              {expanded ? (
                <ul className="flex flex-col gap-2 pb-4">
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
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
