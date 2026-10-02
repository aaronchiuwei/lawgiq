"use client";

import { useGSAP } from "@gsap/react";
import { ArrowRightIcon, CheckCircleIcon, ClockCountdownIcon, QuestionIcon } from "@phosphor-icons/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { CountUp, DerivedNote, GeneratedLine, NewMark, Portrait } from "@/components/case/atoms";
import { FreshnessIndicator, RoleSwitcher } from "@/components/case/chrome";
import { ConflictFlag, LastVisitDemo, ThresholdStepper } from "@/components/case/controls";
import { canAnimate } from "@/components/case/motion";
import { ShareEditor } from "@/components/case/share-editor";
import { KIND_ICON, SourceChip } from "@/components/case/sources";
import { CoverageGauge, HATCH, TreatmentRibbon } from "@/components/case/viz";
import type { SourceRef } from "@/lib/clio/types";
import type { FirmView } from "@/lib/access";
import type { CaseFile } from "@/lib/derive";
import { capitalize, fmtDate, fmtUsd, initials, relDays } from "@/lib/format";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Option B, Story. The case told top to bottom: a hero that collapses into a
 * sticky header, a summary that lights up sentence by sentence, specials that
 * stack as you pass them, and the 2023-2026 chronology as a pinned
 * horizontal scrub. A persistent chapter nav jumps anywhere instantly.
 * Library: GSAP + ScrollTrigger, because pinning and scrubbing are the point.
 */

const CHAPTERS = [
  { id: "summary", label: "Summary" },
  { id: "money", label: "Money" },
  { id: "action", label: "Action" },
  { id: "timeline", label: "Timeline" },
  { id: "medical", label: "Medical" },
  { id: "liability", label: "Liability" },
  { id: "strength", label: "Strength" },
  { id: "sharing", label: "Sharing" },
] as const;

const DISPLAY = "font-[family-name:var(--font-display)] [font-variation-settings:'wdth'_92]";

export function StoryFirm({ view, providers }: { view: FirmView & { digestPending: boolean }; providers: { id: string; shortName: string }[] }) {
  const c = view.case;
  const root = useRef<HTMLDivElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState<string>("summary");
  const [showAll, setShowAll] = useState(false);

  useGSAP(
    () => {
      const shell = root.current?.closest(".reveal-root");
      const done = () => shell?.classList.add("revealed");

      const mm = gsap.matchMedia();
      mm.add({ wide: "(min-width: 900px)", motion: "(prefers-reduced-motion: no-preference)" }, (ctx) => {
        const { wide, motion } = ctx.conditions as { wide: boolean; motion: boolean };
        if (!motion || !canAnimate()) {
          done();
          return;
        }

        // 1. Hero entrance: portrait, name, then the money.
        const intro = gsap.timeline({ defaults: { ease: "expo.out", duration: 0.8 }, onComplete: done });
        intro
          .fromTo("[data-reveal='portrait']", { autoAlpha: 0, scale: 0.94 }, { autoAlpha: 1, scale: 1 })
          .fromTo("[data-name-line]", { yPercent: 105 }, { yPercent: 0, stagger: 0.08, duration: 0.9 }, "<0.05")
          .fromTo("[data-reveal='name']", { autoAlpha: 1 }, { autoAlpha: 1, duration: 0 }, "<")
          .fromTo("[data-reveal='kpi']", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, stagger: 0.08 }, "<0.25")
          .fromTo("[data-reveal='rest']", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, "<0.2");

        // 2. Hero parallax-collapses as the header takes over.
        gsap.to("[data-hero-portrait]", { yPercent: 18, scale: 0.86, ease: "none", scrollTrigger: { trigger: "[data-hero]", start: "top top", end: "bottom top", scrub: true } });
        gsap.to("[data-hero-copy]", { yPercent: -14, autoAlpha: 0.1, ease: "none", scrollTrigger: { trigger: "[data-hero]", start: "30% top", end: "bottom top", scrub: true } });

        // 3. Summary sentences light up as they cross the reading line.
        gsap.utils.toArray<HTMLElement>("[data-sentence]").forEach((el) => {
          gsap.fromTo(el, { opacity: 0.5 }, { opacity: 1, ease: "none", scrollTrigger: { trigger: el, start: "top 85%", end: "top 68%", scrub: true } });
        });

        // 4. The coverage bar: value fills, then the gap above the limit.
        const cov = gsap.timeline({ scrollTrigger: { trigger: "[data-coverage]", start: "top 70%", once: true } });
        cov.fromTo("[data-coverage] [data-bar]", { scaleX: 0, transformOrigin: "left" }, { scaleX: 1, duration: 1, ease: "expo.out" }).fromTo(
          "[data-coverage] [data-gap]",
          { scaleX: 0, transformOrigin: "left" },
          { scaleX: 1, duration: 0.9, ease: "expo.out" },
          "-=0.4",
        );

        // 5. Specials grow as a stack while the section is pinned.
        if (wide) {
          const blocks = gsap.utils.toArray<HTMLElement>("[data-stack-block]");
          const rows = gsap.utils.toArray<HTMLElement>("[data-stack-row]");
          gsap.set(blocks, { scaleY: 0, transformOrigin: "bottom" });
          gsap.set(rows, { autoAlpha: 0.55 });
          const stack = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: "[data-stack-pin]",
              start: "top top",
              end: () => `+=${window.innerHeight * 0.6}`,
              pin: true,
              scrub: 0.6,
              // The total stays the real, sourced figure; only the stack animates.
            },
          });
          blocks.forEach((b, i) => stack.to(b, { scaleY: 1, duration: 1 }, i).to(rows[i], { autoAlpha: 1, duration: 0.4 }, i));
        }

        // 6. The chronology as a pinned horizontal scrub.
        if (wide) {
          const track = document.querySelector<HTMLElement>("[data-track]");
          if (track) {
            const distance = () => Math.max(0, track.scrollWidth - window.innerWidth + 64);
            gsap.to(track, {
              x: () => -distance(),
              ease: "none",
              scrollTrigger: { trigger: "[data-track-pin]", start: "top top", end: () => `+=${distance() * 0.55}`, pin: true, scrub: 0.8, invalidateOnRefresh: true },
            });
            gsap.fromTo("[data-track-progress]", { scaleX: 0 }, { scaleX: 1, ease: "none", transformOrigin: "left", scrollTrigger: { trigger: "[data-track-pin]", start: "top top", end: () => `+=${distance() * 0.55}`, scrub: true } });
          }
        }

        // 7. Everything else rises in as it arrives.
        gsap.set("[data-rise]", { autoAlpha: 0, y: 18 });
        ScrollTrigger.batch("[data-rise]", {
          start: "top 88%",
          once: true,
          onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, stagger: 0.06, duration: 0.7, ease: "expo.out", overwrite: true }),
        });
        gsap.utils.toArray<HTMLElement>("[data-bars]").forEach((el) => {
          const bars = el.querySelectorAll("[data-bar], [data-gap]");
          gsap.set(bars, { scaleX: 0, transformOrigin: "left center" });
          ScrollTrigger.create({ trigger: el, start: "top 80%", once: true, onEnter: () => gsap.to(bars, { scaleX: 1, duration: 0.8, stagger: 0.03, ease: "expo.out" }) });
        });
      });

      // Navigation state works with or without motion. Created after the pins
      // so their positions include the pin spacers.
      ScrollTrigger.create({ trigger: "[data-hero]", start: "bottom 120px", onEnter: () => setCollapsed(true), onLeaveBack: () => setCollapsed(false) });
      gsap.utils.toArray<HTMLElement>("[data-chapter]").forEach((el) => {
        ScrollTrigger.create({ trigger: el, start: "top 45%", end: "bottom 45%", onToggle: (self) => self.isActive && setActive(el.id) });
      });

      document.fonts?.ready.then(() => ScrollTrigger.refresh());
    },
    { scope: root },
  );

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
    setActive(id);
  };

  const v = c.kpis.estimatedValue;
  const lim = c.kpis.coverage.defendantLimit;
  const conflictFor = (anchor: string) => c.conflicts.filter((x) => x.anchor === anchor);

  return (
    <div ref={root}>
      {/* ------------------------------------------------ sticky chrome -- */}
      <header
        data-collapsed={collapsed}
        className={cn(
          "fixed inset-x-0 top-0 z-30 border-b transition-[background-color,border-color,box-shadow] duration-300",
          collapsed ? "border-line bg-[color-mix(in_oklab,var(--paper)_86%,transparent)] shadow-[0_8px_24px_-16px_color-mix(in_oklab,var(--ink)_40%,transparent)] backdrop-blur-xl" : "border-transparent bg-transparent",
        )}
      >
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-5 gap-y-2 px-4 pt-3 sm:px-8">
          <Link href="/" className={cn(DISPLAY, "text-[18px] font-bold tracking-[-0.02em] text-ink")}>
            Lawgiq
          </Link>
          <div
            aria-hidden={!collapsed}
            className={cn("flex items-center gap-2.5 transition-[opacity,transform] duration-300 ease-[var(--ease-out-strong)]", collapsed ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0")}
          >
            <span className="grid size-7 place-items-center overflow-hidden rounded-full bg-ink text-[11px] font-semibold text-paper">
              {view.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={view.photo} alt="" className="size-full object-cover" />
              ) : (
                initials(c.client.name)
              )}
            </span>
            <span className="text-[14px] font-medium text-ink">{c.client.name}</span>
            {v && lim ? (
              <span className="tnum hidden text-[13px] text-ink-soft md:inline">
                {fmtUsd(v.value, { compact: true })} value · {fmtUsd(lim.value, { compact: true })} limit
              </span>
            ) : null}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
            <RoleSwitcher role="firm" providers={providers} />
            <FreshnessIndicator freshness={view.freshness} compact={collapsed} />
          </div>
        </div>
        <nav aria-label="Chapters" className="mx-auto max-w-[90rem] overflow-x-auto px-4 pb-2 pt-2 sm:px-8">
          <ul className="flex w-max gap-1">
            {CHAPTERS.map((ch) => (
              <li key={ch.id}>
                <a
                  href={`#${ch.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    jump(ch.id);
                  }}
                  aria-current={active === ch.id ? "location" : undefined}
                  className={cn(
                    "block rounded-full px-3 py-1 text-[13px] transition-[background-color,color] duration-200",
                    active === ch.id ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-2 hover:text-ink",
                  )}
                >
                  {ch.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* --------------------------------------------------------- hero -- */}
      <section data-hero aria-labelledby="client-name" className="relative overflow-hidden">
        <div className="mx-auto grid min-h-[100dvh] max-w-[90rem] items-center gap-10 px-4 pb-16 pt-32 sm:px-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16 lg:pb-20">
          <div data-hero-portrait>
            <div data-reveal="portrait">
              <Portrait
                name={c.client.name}
                photo={view.photo ?? c.client.avatarUrl}
                editable
                className="aspect-[4/5] w-full max-w-[9rem] rounded-[1.25rem] sm:max-w-[12rem] lg:max-w-[22rem] lg:rounded-[2rem] shadow-[0_30px_60px_-30px_color-mix(in_oklab,var(--ink)_45%,transparent)]"
                initialsClassName={cn(DISPLAY, "text-[3.5rem] lg:text-[7rem] font-extrabold tracking-[-0.04em] bg-[color-mix(in_oklab,var(--signal)_14%,var(--paper-2))] text-signal")}
              />
            </div>
          </div>
          <div data-hero-copy className="min-w-0">
            <h1 id="client-name" data-reveal="name" className={cn(DISPLAY, "text-[clamp(3.5rem,2rem+7vw,8.5rem)] font-extrabold leading-[0.9] tracking-[-0.035em] text-ink")}>
              {c.client.name.split(" ").map((part) => (
                <span key={part} className="block overflow-hidden pb-[0.04em]">
                  <span data-name-line className="block">
                    {part}
                  </span>
                </span>
              ))}
            </h1>
            <p data-reveal="kpi" className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[16px] text-ink-soft">
              <span className="text-ink">{c.matter.caseType}</span>
              {c.matter.dateOfIncident ? (
                <>
                  <span aria-hidden>/</span>
                  <span className="tnum">Incident {fmtDate(c.matter.dateOfIncident.value)}</span>
                  <SourceChip sources={c.matter.dateOfIncident.source} variant="icon" />
                </>
              ) : null}
              <span aria-hidden>/</span>
              <span>
                {c.matter.stage}, stage {c.matter.stagesInOrder.indexOf(c.matter.stage ?? "") + 1} of {c.matter.stagesInOrder.length}
              </span>
            </p>
            <dl className="mt-10 grid gap-x-10 gap-y-6 sm:grid-cols-3">
              <Kpi label="Estimated value" sources={v ? [v.source, ...(v.also ?? [])] : null}>
                {v ? <CountUp value={v.value} delay={500} /> : "Not set"}
              </Kpi>
              <Kpi
                label={conflictFor("coverage").length ? "Policy limit on record" : c.kpis.coverage.confirmed ? "Policy limit, confirmed" : "Policy limit, unconfirmed"}
                sources={lim ? [lim.source, ...(lim.also ?? [])] : null}
                extra={conflictFor("coverage").map((x) => <ConflictFlag key={x.id} conflict={x} label="1 record disagrees" />)}
              >
                {lim ? <CountUp value={lim.value} delay={600} /> : "None"}
              </Kpi>
              <Kpi label={`Firm spend, ${c.kpis.firmSpend.count} entries`} sources={c.kpis.firmSpend.items.map((i) => i.source)}>
                <CountUp value={c.kpis.firmSpend.value} delay={700} />
              </Kpi>
            </dl>
            {c.kpis.coverage.gap && c.kpis.coverage.gap.value > 0 ? (
              <p data-reveal="rest" className="mt-8 max-w-[40rem] text-[clamp(1.15rem,1rem+0.6vw,1.5rem)] leading-snug text-ink">
                Worth <span className="tnum font-semibold text-exposure">{fmtUsd(c.kpis.coverage.gap.value)}</span> more than the coverage behind it.{" "}
                <a href="#money" onClick={(e) => (e.preventDefault(), jump("money"))} className="inline-flex items-center gap-1 text-[15px] text-signal underline-offset-4 hover:underline">
                  See the money <ArrowRightIcon size={14} aria-hidden />
                </a>
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ summary -- */}
      <Chapter id="summary" title="The ninety-second version">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <div className="flex flex-col gap-6">
              {c.digest.sentences.map((s, i) => (
                <p key={i} data-sentence className={cn(DISPLAY, "sync-skel text-[clamp(1.5rem,1.1rem+1.4vw,2.6rem)] font-semibold leading-[1.18] tracking-[-0.02em] text-ink")}>
                  <span>
                    {s.text} <SourceChip sources={s.sources} className="translate-y-[-0.3em] align-middle" />
                  </span>
                </p>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
              <DerivedNote kind={c.digest.generator.kind === "ai" ? "ai" : "rules"} sources={c.digest.sentences.flatMap((s) => s.sources)}>
                Built once from Clio fields and derived facts, cached until the data changes. Each sentence links to the records it rests on.
              </DerivedNote>
              <GeneratedLine itemCount={c.digest.itemCount} generatedAt={c.digest.generatedAt} generator={c.digest.generator} />
            </div>
          </div>
          <aside data-rise className="self-start rounded-[var(--radius)] border border-line bg-card-bg p-5 lg:sticky lg:top-32">
            <h3 className="text-[16px] font-semibold text-ink">Since you last opened it</h3>
            <p className="mt-0.5 text-[12.5px] text-ink-soft">{c.changes.firstVisit ? "First visit: last two weeks" : `Since ${fmtDate(c.changes.since)}`}</p>
            <ul aria-live="polite" className="mt-3 flex flex-col gap-2.5">
              {c.changes.items.length === 0 ? <li className="text-[13.5px] text-ink-soft">Nothing new.</li> : null}
              {c.changes.items.slice(0, 6).map((e) => (
                <li key={e.id}>
                  <NewMark isNew className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-baseline gap-2 text-[13.5px]">
                    <span className="tnum text-ink-soft">{fmtDate(e.date, { year: false })}</span>
                    <span className="leading-snug text-ink">{e.title}</span>
                    <SourceChip sources={e.source} variant="icon" />
                  </NewMark>
                </li>
              ))}
            </ul>
            <LastVisitDemo className="mt-4" />
          </aside>
        </div>
      </Chapter>

      {/* -------------------------------------------------------- money -- */}
      <Chapter id="money" title={c.kpis.coverage.gap && c.kpis.coverage.gap.value > 0 ? "The value outruns the coverage" : "The coverage covers the value"}>
        <div data-coverage className="max-w-[60rem]">
          <p className="max-w-[44rem] text-[17px] leading-relaxed text-ink-soft">
            {v && lim
              ? v.value > lim.value
                ? `Estimated value is ${fmtUsd(v.value)}. The per-person limit on record is ${fmtUsd(lim.value)}, so on that limit recovery is capped well below what the injuries are worth unless a second source of coverage is found.`
                : `Estimated value is ${fmtUsd(v.value)}, within the ${fmtUsd(lim.value)} per-person limit on record.`
              : "Value or limits are missing in Clio."}
          </p>
          <CoverageGauge c={c} className="mt-8 [&_.h-3]:h-6" />
          {conflictFor("coverage").map((x) => (
            <p key={x.id} className="mt-4 flex flex-wrap items-center gap-2 text-[15px] text-ink">
              <ConflictFlag conflict={x} label="Whose limit is this?" />
              <span className="text-ink-soft">{x.detail}</span>
            </p>
          ))}
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-[14px]">
            {c.kpis.coverage.lines.map((l) => (
              <span key={l.label} className="text-ink-soft">
                {l.label} <span className="tnum text-ink">{fmtUsd(l.perPerson!)}{l.perOccurrence ? ` / ${fmtUsd(l.perOccurrence)}` : ""}</span>
                {/no-fault/i.test(l.label) && c.kpis.noFault?.exhausted ? <span className="text-caution"> exhausted</span> : null}
              </span>
            ))}
            {c.kpis.liens.map((l) => (
              <span key={l.holder} className="text-ink-soft">
                {l.holder.replace(/^New York State /, "")} lien <span className="tnum text-ink">{l.amount ? fmtUsd(l.amount) : "unknown"}</span> comes off the top
              </span>
            ))}
            {c.kpis.coverage.gap ? (
              <DerivedNote sources={[c.kpis.coverage.gap.source, ...(c.kpis.coverage.gap.also ?? [])]}>{c.kpis.coverage.gap.derivation}</DerivedNote>
            ) : null}
          </div>
        </div>
        <SpecialsStack c={c} totalRef={totalRef} />
      </Chapter>

      {/* ------------------------------------------------------- action -- */}
      <Chapter id="action" title="What needs action">
        <div className="grid gap-5 lg:grid-cols-3">
          <Panel title="Deadlines">
            <SolRow c={c} />
            <ul className="mt-4 flex flex-col gap-3">
              {c.deadlines.filter((d) => d.kind !== "treatment").slice(0, 4).map((d) => (
                <li key={d.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-baseline gap-2 text-[14px]">
                  <span className="tnum text-ink-soft">{fmtDate(d.date, { year: false })}</span>
                  <span className="leading-snug text-ink">{d.title}</span>
                  <SourceChip sources={d.source} variant="icon" />
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Tasks">
            <TaskGroup label="Overdue" tone="exposure" items={c.tasks.overdue} conflictFor={conflictFor} />
            <TaskGroup label="Coming up" tone="ink" items={c.tasks.comingUp} conflictFor={conflictFor} />
            <TaskGroup label="Waiting on others" tone="caution" items={c.tasks.waiting} conflictFor={conflictFor} />
          </Panel>
          <Panel title="Client contact">
            {c.clientContact.last ? (
              <>
                <p className={cn(DISPLAY, "tnum text-[3rem] font-bold leading-none tracking-[-0.03em]", c.clientContact.stale ? "text-exposure" : "text-ink")}>
                  {c.clientContact.last.daysAgo}
                  <span className="ml-1.5 font-[family-name:var(--font-text)] text-[16px] font-medium tracking-normal text-ink-soft">days ago</span>
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                  <span className="tnum text-ink">{fmtDate(c.clientContact.last.date)}</span> by {c.clientContact.last.channel}: {c.clientContact.last.subject}{" "}
                  <SourceChip sources={c.clientContact.last.source} variant="icon" className="align-middle" />
                </p>
              </>
            ) : (
              <p className="text-[14px] text-exposure">No client communication in Clio.</p>
            )}
            <p className={cn("mt-3 text-[13.5px]", c.clientContact.stale ? "font-medium text-exposure" : "text-good")}>
              {c.clientContact.stale ? `Over the ${c.clientContact.thresholdDays}-day threshold. Call the client.` : `Within the ${c.clientContact.thresholdDays}-day threshold.`}
            </p>
            <ThresholdStepper className="mt-3" setting="clientContactStaleDays" value={c.clientContact.thresholdDays} label="Flag after" />
          </Panel>
        </div>
      </Chapter>

      {/* ----------------------------------------------------- timeline -- */}
      <section id="timeline" data-chapter aria-labelledby="timeline-h" className="scroll-mt-0 border-t border-line">
        <div data-track-pin className="relative flex flex-col overflow-hidden pb-16 pt-28 min-[900px]:h-[100dvh] min-[900px]:justify-center min-[900px]:pt-24">
          <div className="mx-auto w-full max-w-[90rem] px-4 sm:px-8">
            <h2 id="timeline-h" className={cn(DISPLAY, "text-[clamp(2.4rem,1.6rem+3vw,4.5rem)] font-extrabold leading-[0.95] tracking-[-0.04em] text-ink")}>
              2023 to now
            </h2>
            <p className="mt-3 max-w-[40rem] text-[16px] text-ink-soft">
              The ten moments that shaped the file, ranked from {c.events.length} records.<span className="hidden min-[900px]:inline"> Keep scrolling to move through time.</span>
            </p>
          </div>
          <div className="relative mt-10">
            <div data-track className="flex w-full flex-col gap-4 px-4 sm:px-8 min-[900px]:w-max min-[900px]:flex-row min-[900px]:items-stretch min-[900px]:gap-5">
              {c.topEvents.map((e, i) => {
                const newYear = i === 0 || c.topEvents[i - 1].date.slice(0, 4) !== e.date.slice(0, 4);
                return (
                  <div key={e.id} className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-stretch">
                    {newYear ? (
                      <div className={cn(DISPLAY, "tnum flex items-start pt-1 text-[2.25rem] font-extrabold leading-none tracking-[-0.04em] text-ink-soft min-[900px]:w-[5.5rem]")} aria-hidden>
                        {e.date.slice(0, 4)}
                      </div>
                    ) : null}
                    <article className="flex w-full flex-col justify-between rounded-[var(--radius)] border border-line bg-card-bg p-5 min-[900px]:w-[21rem]">
                      <div>
                        <p className="flex items-center justify-between gap-3 text-[13px]">
                          <span className="tnum text-ink-soft">{fmtDate(e.date)}</span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-medium", e.category === "liability" ? "bg-exposure-wash text-exposure" : e.category === "medical" ? "bg-signal-wash text-signal" : "bg-paper-2 text-ink")}>
                            {c.digest.reasons?.[e.id] ?? e.reason}
                          </span>
                        </p>
                        <h3 className="mt-3 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-ink">{e.title}</h3>
                        <p className="mt-2 line-clamp-4 text-[14px] leading-relaxed text-ink-soft">{e.source.snippet}</p>
                      </div>
                      <div className="mt-4">
                        <SourceChip sources={[e.source, ...e.duplicates]} />
                      </div>
                    </article>
                  </div>
                );
              })}
              <OpenQuestionCard c={c} />
            </div>
          </div>
          <div className="mx-auto mt-10 hidden w-full max-w-[90rem] px-8 min-[900px]:block" aria-hidden>
            <div className="h-1 rounded-full bg-line">
              <div data-track-progress className="h-full origin-left rounded-full bg-signal" />
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-[90rem] px-4 pb-16 sm:px-8">
          <button
            type="button"
            aria-expanded={showAll}
            onClick={() => setShowAll((s) => !s)}
            className="inline-flex h-10 items-center rounded-full border border-line-strong px-5 text-[14px] text-ink transition-[border-color,transform] duration-150 hover:border-ink active:scale-[0.97]"
          >
            {showAll ? "Hide the full chronology" : `Show all ${c.events.length} records`}
          </button>
          {showAll ? <FullChronology c={c} /> : null}
        </div>
      </section>

      {/* ------------------------------------------------------ medical -- */}
      <Chapter id="medical" title="Injuries and treatment">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {c.treatment.injuries.map((inj) => (
            <div key={inj.region} data-rise className="rounded-[var(--radius)] border border-line bg-card-bg p-5">
              <h3 className="flex items-center justify-between gap-2 text-[17px] font-semibold text-ink">
                {inj.region}
                <SourceChip sources={inj.claimedIn} variant="icon" />
              </h3>
              {inj.imaging.map((s) => (
                <p key={s.study} className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                  <span className="font-medium text-ink">{s.study}</span>
                  {s.date ? <span className="tnum"> ({fmtDate(s.date)})</span> : null}: {s.finding}
                </p>
              ))}
            </div>
          ))}
          <div data-rise className="rounded-[var(--radius)] border border-line bg-card-bg p-5">
            <h3 className="text-[17px] font-semibold text-ink">Procedures</h3>
            <ul className="mt-3 flex flex-col gap-3">
              {c.treatment.procedures.map((p) => (
                <li key={p.label} className="flex items-start gap-2.5 text-[14px]">
                  {p.status === "performed" ? <CheckCircleIcon size={18} weight="fill" className="shrink-0 text-good" aria-hidden /> : <ClockCountdownIcon size={18} className="shrink-0 text-exposure" aria-hidden />}
                  <span className="text-ink">
                    {capitalize(p.label)}, {p.status === "performed" ? `performed ${fmtDate(p.date)}` : `recommended ${fmtDate(p.date)}, no date set`}
                  </span>
                  <SourceChip sources={[p.source, ...p.also]} variant="icon" />
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div data-bars className="mt-12 rounded-[var(--radius)] border border-line bg-card-bg p-5 sm:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-[19px] font-semibold text-ink">Every dated record of care, by provider</h3>
            <ThresholdStepper setting="treatmentGapDays" value={c.thresholds.treatmentGapDays} label="Gap after" min={14} step={15} />
          </div>
          <TreatmentRibbon c={c} className="mt-5 [--ribbon-label:11rem]" />
        </div>
      </Chapter>

      {/* ---------------------------------------------------- liability -- */}
      <Chapter id="liability" title="Who is at fault, and what could go wrong">
        {c.liability.crux ? (
          <blockquote data-rise className="max-w-[62rem]">
            <p className="text-[15px] font-medium text-exposure">The crux: {c.liability.crux.question.toLowerCase()}</p>
            <p className={cn(DISPLAY, "mt-3 text-[clamp(1.6rem,1.2rem+1.6vw,2.8rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-ink")}>“{c.liability.crux.text}”</p>
            <SourceChip sources={c.liability.crux.source} className="mt-4" />
          </blockquote>
        ) : null}
        <div className="mt-12 grid gap-10 lg:grid-cols-2">
          <div data-rise>
            <h3 className="text-[17px] font-semibold text-ink">How it happened, in the client&apos;s words</h3>
            {c.liability.mechanism ? (
              <p className="mt-2 text-[15.5px] leading-relaxed text-ink">
                {c.liability.mechanism.text} <SourceChip sources={c.liability.mechanism.source} variant="icon" />
              </p>
            ) : null}
            <ul className="mt-5 flex flex-col gap-2">
              {c.liability.adverse.map((a) => (
                <li key={a.name} className="text-[14.5px] text-ink-soft">
                  <span className="font-medium text-ink">{a.name}</span>, {a.role.toLowerCase()} <SourceChip sources={a.source} variant="icon" />
                </li>
              ))}
            </ul>
          </div>
          <div data-rise>
            <h3 className="text-[17px] font-semibold text-ink">Risks raised in the file</h3>
            <ul className="mt-3 flex flex-col divide-y divide-line">
              {c.liability.risks.map((r) => (
                <li key={r.id} className="flex items-baseline gap-3 py-2.5 text-[14.5px]">
                  <span className={cn("w-16 shrink-0 text-[12.5px] font-semibold", r.severity === 3 ? "text-exposure" : r.severity === 2 ? "text-caution" : "text-ink-soft")}>
                    {r.severity === 3 ? "High" : r.severity === 2 ? "Medium" : "Low"}
                  </span>
                  <span className="flex-1 text-ink">{r.label}</span>
                  <SourceChip sources={r.sources} variant="icon" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Chapter>

      {/* ----------------------------------------------------- strength -- */}
      <Chapter id="strength" title="How strong is it?">
        <StrengthBoard c={c} />
      </Chapter>

      {/* ------------------------------------------------------ sharing -- */}
      <Chapter id="sharing" title="What providers will see">
        <ShareEditor drafts={view.providerDrafts} shares={view.shares} previewHref={(id) => `/option-b?role=provider&provider=${encodeURIComponent(id)}`} />
      </Chapter>

      <footer className="mx-auto max-w-[90rem] border-t border-line px-4 py-8 text-[13px] text-ink-soft sm:px-8">
        Read-only from Clio Manage. Sharing log, visibility, last-opened times, digests and the client photo live in our own database.
      </footer>
    </div>
  );
}

/* ---------------------------------------------------------------- parts -- */

function Chapter({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} data-chapter aria-labelledby={`${id}-h`} className="scroll-mt-0 border-t border-line">
      <div className="mx-auto max-w-[90rem] px-4 pb-20 pt-32 sm:px-8 lg:pb-24">
        <h2 id={`${id}-h`} data-rise className={cn(DISPLAY, "mb-10 max-w-[56rem] text-[clamp(2.4rem,1.6rem+3vw,4.5rem)] font-extrabold leading-[0.95] tracking-[-0.04em] text-ink")}>
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

function Kpi({ label, sources, children, extra }: { label: string; sources: SourceRef[] | null; children: ReactNode; extra?: ReactNode }) {
  return (
    <div data-reveal="kpi" className="border-t border-line-strong pt-3">
      <dt className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink-soft">
        {label}
        {extra}
      </dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span className={cn(DISPLAY, "sync-skel text-[clamp(2rem,1.4rem+2vw,3.25rem)] font-bold leading-none tracking-[-0.035em] text-ink")}>
          <span>{children}</span>
        </span>
        <SourceChip sources={sources} variant="icon" />
      </dd>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section data-rise className="rounded-[var(--radius)] border border-line bg-card-bg p-6">
      <h3 className="mb-4 text-[18px] font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function SolRow({ c }: { c: CaseFile }) {
  const sol = c.sol;
  const ok = sol.status === "satisfied";
  return (
    <div className={cn("rounded-[calc(var(--radius)-6px)] p-3.5", ok ? "bg-good-wash" : sol.status === "expired" ? "bg-exposure-wash" : "bg-caution-wash")}>
      <p className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
        {ok ? <CheckCircleIcon size={18} weight="fill" className="text-good" aria-hidden /> : <ClockCountdownIcon size={18} className="text-exposure" aria-hidden />}
        Statute of limitations {ok ? "satisfied" : sol.status === "expired" ? "expired" : relDays(sol.daysUntil)}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-soft">
        <span className="tnum">{fmtDate(sol.date)}</span> · {ok ? "suit filed in time; task closed" : "check the limitations task"}
        <SourceChip sources={sol.sources} variant="icon" />
      </p>
    </div>
  );
}

function TaskGroup({ label, tone, items, conflictFor }: { label: string; tone: "exposure" | "ink" | "caution"; items: CaseFile["tasks"]["overdue"]; conflictFor: (id: string) => CaseFile["conflicts"] }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className={cn("text-[13px] font-semibold", tone === "exposure" ? "text-exposure" : tone === "caution" ? "text-caution" : "text-ink-soft")}>
        {label} <span className="tnum">({items.length})</span>
      </p>
      <ul className="mt-1.5 flex flex-col gap-2">
        {items.length === 0 ? <li className="text-[13.5px] text-ink-soft">None.</li> : null}
        {items.map((t) => (
          <li key={t.id} className="text-[14px] leading-snug">
            <span className="text-ink">{t.waitingOn ? `${t.waitingOn.split(/\s/)[0]}: ` : ""}{t.title}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-soft">
              <span className="tnum">{t.due ? `${fmtDate(t.due, { year: false })}, ${relDays(t.daysUntilDue)}` : "No date"}</span>
              <SourceChip sources={t.source} variant="icon" />
              {conflictFor(t.id).map((x) => (
                <ConflictFlag key={x.id} conflict={x} />
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SpecialsStack({ c, totalRef }: { c: CaseFile; totalRef: React.RefObject<HTMLSpanElement | null> }) {
  const s = c.specials;
  if (!s) return <p className="mt-12 text-[15px] text-ink-soft">No itemised specials tally found in the notes.</p>;
  const lines = [...s.lines].sort((a, b) => b.amount - a.amount);
  const name = (id: string | null) => c.providers.find((p) => p.id === id)?.shortName;
  return (
    <div data-stack-pin className="mt-20 min-[900px]:flex min-[900px]:h-[100dvh] min-[900px]:items-center">
      <div className="grid w-full items-end gap-10 min-[900px]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] min-[900px]:gap-16">
        <div className="mx-auto flex h-[60vh] max-h-[34rem] w-full max-w-[15rem] flex-col-reverse overflow-hidden rounded-[1.25rem] border border-line bg-paper-2 max-[899px]:hidden" aria-hidden>
          {lines.map((l, i) => {
            const uncertain = s.uncertainLabels.includes(l.label);
            return (
              <div
                key={l.label}
                data-stack-block
                data-amount={l.amount}
                className="w-full border-t border-[color-mix(in_oklab,var(--paper)_60%,transparent)]"
                style={{
                  height: `${(l.amount / s.total) * 100}%`,
                  background: uncertain ? undefined : `color-mix(in oklab, var(--signal) ${100 - i * 9}%, var(--paper-2))`,
                  backgroundImage: uncertain ? HATCH("var(--caution)") : undefined,
                  backgroundColor: uncertain ? "var(--caution-wash)" : undefined,
                }}
              />
            );
          })}
        </div>
        <div>
          <h3 className="text-[17px] font-semibold text-ink">Medical specials</h3>
          <p className={cn(DISPLAY, "mt-1 flex flex-wrap items-baseline gap-3 text-[clamp(2.6rem,1.8rem+3vw,4.5rem)] font-extrabold leading-none tracking-[-0.04em] text-ink")}>
            <span ref={totalRef} className="tnum">
              {fmtUsd(s.total)}
            </span>
            {c.kpis.specials?.interim ? (
              <span className="rounded-full bg-caution-wash px-3 py-1 font-[family-name:var(--font-text)] text-[14px] font-semibold tracking-normal text-caution">Interim</span>
            ) : null}
          </p>
          <ul className="mt-6 flex flex-col">
            {lines.map((l) => (
              <li key={l.label} data-stack-row className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-t border-line py-2.5 text-[15px]">
                <span className="min-w-0 truncate text-ink">
                  {name(l.providerId) ?? l.label}
                  <span className="text-ink-soft"> · {name(l.providerId) ? l.label : l.detail}</span>
                  {s.uncertainLabels.includes(l.label) ? <span className="ml-2 text-[12.5px] font-medium text-caution">unreconciled</span> : null}
                </span>
                <span className="tnum text-ink">{fmtUsd(l.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex flex-wrap items-center gap-2 text-[13.5px] text-ink-soft">
            {s.coverage ? `Bills in from ${s.coverage.reported} of ${s.coverage.of} providers.` : null}
            <SourceChip sources={[s.source, ...(c.kpis.specials ? [c.kpis.specials.source] : []), ...(c.kpis.specials?.interimReason ? [c.kpis.specials.interimReason] : [])]} label={`Tally ${fmtDate(s.asOf)}`} />
          </p>
        </div>
      </div>
    </div>
  );
}

function OpenQuestionCard({ c }: { c: CaseFile }) {
  const open = c.treatment.procedures.find((p) => p.status === "recommended" && p.openForDays !== null);
  if (!open) return null;
  return (
    <article className="flex w-full flex-col justify-between rounded-[var(--radius)] border-2 border-exposure bg-exposure-wash p-5 min-[900px]:w-[24rem]">
      <div>
        <p className="flex items-center gap-2 text-[13px] font-semibold text-exposure">
          <QuestionIcon size={16} weight="bold" aria-hidden /> Still open today
        </p>
        <h3 className="mt-3 text-[21px] font-semibold leading-snug tracking-[-0.01em] text-ink">
          {capitalize(open.label)} recommended {fmtDate(open.date)}. No date in {open.openForDays} days.
        </h3>
        <p className="mt-2 text-[14px] leading-relaxed text-ink">
          {open.followUps} approaches to the surgeon&apos;s office since. Treatment can&apos;t close and the specials keep moving until it is scheduled.
        </p>
      </div>
      <SourceChip sources={[open.source, ...open.also]} className="mt-4 self-start" />
    </article>
  );
}

function FullChronology({ c }: { c: CaseFile }) {
  return (
    <ol className="mt-8 grid gap-x-10 md:grid-cols-2">
      {[...c.events].reverse().map((e) => {
        const I = KIND_ICON[e.source.kind];
        return (
          <li key={e.id} className="grid grid-cols-[6.5rem_1.25rem_minmax(0,1fr)_auto] items-baseline gap-2 border-t border-line py-2 text-[14px]">
            <span className="tnum text-ink-soft">{fmtDate(e.date)}</span>
            <I size={14} className="translate-y-0.5 text-ink-soft" aria-hidden />
            <span className="leading-snug text-ink">
              {e.title}
              {e.date > c.today ? <span className="ml-2 text-[12.5px] text-signal">upcoming</span> : null}
            </span>
            <SourceChip sources={[e.source, ...e.duplicates]} variant="icon" />
          </li>
        );
      })}
    </ol>
  );
}

function StrengthBoard({ c }: { c: CaseFile }) {
  const [open, setOpen] = useState<string | null>(c.scorecard.factors[0]?.id ?? null);
  const s = c.scorecard;
  return (
    <div className="grid gap-12 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div data-rise>
        <p className={cn(DISPLAY, "tnum text-[clamp(5rem,3rem+6vw,9rem)] font-extrabold leading-[0.85] tracking-[-0.06em] text-ink")}>
          <CountUp value={s.total} format={(n) => Math.round(n).toString()} />
          <span className="text-[0.3em] font-semibold tracking-normal text-ink-soft">/100</span>
        </p>
        <div className="mt-4">
          <DerivedNote kind="rules" title="How the score works">
            {s.method}
          </DerivedNote>
        </div>
      </div>
      <div data-rise className="grid gap-3 sm:grid-cols-2">
        {s.factors.map((f) => {
          const expanded = open === f.id;
          return (
            <div key={f.id} className={cn("rounded-[var(--radius)] border bg-card-bg transition-[border-color] duration-200", expanded ? "border-ink sm:col-span-2" : "border-line")}>
              <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : f.id)} className="flex w-full items-center justify-between gap-4 p-5 text-left">
                <span>
                  <span className="block text-[16px] font-semibold text-ink">{f.label}</span>
                  <span className="tnum text-[13px] text-ink-soft">Weight {f.weight}%</span>
                </span>
                <span className={cn(DISPLAY, "tnum text-[2rem] font-bold tracking-[-0.03em]", f.score >= 3.5 ? "text-good" : f.score >= 2 ? "text-caution" : "text-exposure")}>
                  {f.score.toFixed(1)}
                  <span className="text-[14px] font-medium text-ink-soft">/5</span>
                </span>
              </button>
              {expanded ? (
                <ul className="flex flex-col gap-2 border-t border-line px-5 py-4">
                  {f.evidence.map((ev, i) => (
                    <li key={i} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-2 text-[14px]">
                      <span className={cn("tnum font-semibold", ev.delta >= 0 ? "text-good" : "text-exposure")}>
                        {ev.delta >= 0 ? "+" : "−"}
                        {Math.abs(ev.delta)}
                      </span>
                      <span className="text-ink">{ev.text}</span>
                      <SourceChip sources={ev.sources} variant="icon" />
                    </li>
                  ))}
                  {f.evidence.length === 0 ? <li className="text-[13.5px] text-ink-soft">Nothing moved this factor from its base.</li> : null}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

