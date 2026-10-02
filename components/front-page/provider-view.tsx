"use client";

import { useGSAP } from "@gsap/react";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ClockCountdownIcon, LockSimpleIcon, QuestionIcon, TrayArrowDownIcon, XIcon } from "@phosphor-icons/react";
import gsap from "gsap";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { canAnimate } from "@/components/case/motion";
import { AttendanceStrip } from "@/components/case/viz";
import type { ProviderView } from "@/lib/access";
import { countWord } from "@/lib/derive/headlines";
import { daysBetween, fmtDate, fmtUsd, relDays } from "@/lib/format";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

/**
 * Front Page, provider edition. A provider asks four questions; the page
 * answers all four in one sentence, then in four tiles with a picture each,
 * all above the fold. Detail (what the firm asked for, attendance, updates,
 * this provider's own bills) sits below. Everything here was cut by
 * lib/access before it reached the browser.
 */

type Tone = "good" | "caution" | "exposure" | "quiet";
type Answer = { id: string; q: string; verdict: string; clause: string; tone: Tone; detail: ReactNode; picture: ReactNode };

const TONE_DECO: Record<Tone, string> = { good: "decoration-good/70", caution: "decoration-caution/70", exposure: "decoration-exposure/80", quiet: "decoration-line-strong" };
const TONE_BG: Record<Tone, string> = { good: "bg-good", caution: "bg-caution", exposure: "bg-exposure", quiet: "bg-ink-soft" };

export function FrontPageProvider({ view, shared }: { view: ProviderView; shared?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [hot, setHot] = useState<string | null>(null);
  const today = view.freshness.fetchedAt.slice(0, 10);
  const answers = useMemo(() => buildAnswers(view, today), [view, today]);

  useGSAP(
    () => {
      const shell = root.current?.closest(".reveal-root");
      const mm = gsap.matchMedia();
      mm.add({ motion: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
        shell?.classList.add("revealed");
        if (ctx.conditions?.reduce || !canAnimate()) return;
        const tl = gsap.timeline({ defaults: { ease: "expo.out", duration: 0.6 } });
        tl.fromTo("[data-reveal='eyebrow']", { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0 })
          .fromTo("[data-reveal='clause']", { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, stagger: 0.09, duration: 0.7 }, "<0.1")
          .fromTo("[data-reveal='tile']", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, stagger: 0.07 }, "<0.25")
          .fromTo("[data-verdict-dot]", { scale: 0 }, { scale: 1, stagger: 0.07, duration: 0.5, ease: "back.out(2.5)" }, "<0.15")
          .fromTo("[data-week]", { autoAlpha: 0, scaleY: 0.3 }, { autoAlpha: 1, scaleY: 1, stagger: 0.025, duration: 0.35, transformOrigin: "bottom" }, "<0.1")
          .fromTo("[data-step]", { scaleX: 0 }, { scaleX: 1, stagger: 0.04, duration: 0.4, transformOrigin: "left" }, "<")
          .fromTo("[data-reveal='below']", { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, stagger: 0.08 }, "<0.2");
        return () => tl.kill();
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="mx-auto max-w-[76rem] px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <header>
        <p data-reveal="eyebrow" className="text-[13px] text-ink-soft">
          {shared ? "Shared with" : "Preview of what the firm shares with"} <span className="text-ink">{view.provider.name}</span>
          <span aria-hidden> · </span>
          about {view.patient.name}
          {view.patient.dateOfIncident ? (
            <>
              , injured <span className="tnum text-ink">{fmtDate(view.patient.dateOfIncident)}</span>
            </>
          ) : null}
        </p>
        {/* All four answers as one sentence. Hover a clause to find its tile. */}
        <h1 className="mt-4 max-w-[60rem] font-[family-name:var(--font-display)] text-[clamp(1.9rem,1.2rem+2.4vw,3.2rem)] leading-[1.12] tracking-[-0.022em] text-ink">
          {answers.map((a, i) => (
            <span
              key={a.id}
              data-reveal="clause"
              onPointerEnter={() => setHot(a.id)}
              onPointerLeave={() => setHot(null)}
              className={cn("inline transition-opacity duration-200", hot && hot !== a.id && "opacity-35")}
            >
              <span className={cn("underline decoration-[0.07em] underline-offset-[0.16em] [text-decoration-skip-ink:all]", TONE_DECO[a.tone])}>{a.clause.charAt(0).toUpperCase() + a.clause.slice(1)}</span>
              {i < answers.length - 1 ? ". " : "."}
            </span>
          ))}
        </h1>
      </header>

      <div className="mt-9 grid gap-px overflow-hidden rounded-[6px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {answers.map((a) => (
          <section
            key={a.id}
            data-reveal="tile"
            aria-labelledby={`tile-${a.id}`}
            onPointerEnter={() => setHot(a.id)}
            onPointerLeave={() => setHot(null)}
            className={cn("flex flex-col bg-card-bg p-5 transition-[opacity,background-color] duration-200 sm:p-6", hot && hot !== a.id && "opacity-50", hot === a.id && "bg-paper")}
          >
            <h2 id={`tile-${a.id}`} className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-soft">
              {a.q}
            </h2>
            <p className="mt-3 flex items-center gap-2.5 font-[family-name:var(--font-display)] text-[1.75rem] leading-none text-ink">
              <span data-verdict-dot className={cn("grid size-6 shrink-0 place-items-center rounded-full text-paper", TONE_BG[a.tone])} aria-hidden>
                {a.tone === "good" ? <CheckIcon size={13} weight="bold" /> : a.tone === "exposure" ? <XIcon size={12} weight="bold" /> : <span className="size-1.5 rounded-full bg-paper" />}
              </span>
              {a.verdict}
            </p>
            <div className="mt-2 min-h-[2.75rem] text-[13.5px] leading-snug text-ink-soft">{a.detail}</div>
            <div className="mt-auto pt-5">{a.picture}</div>
          </section>
        ))}
      </div>

      <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-16">
        <div className="flex flex-col gap-12">
          <Needs view={view} />
          <Attendance view={view} today={today} />
        </div>
        <div className="flex flex-col gap-12">
          <Updates view={view} />
          <Ledger view={view} />
        </div>
      </div>

      <p className="mt-16 border-t border-line pt-4 text-[12.5px] leading-relaxed text-ink-soft">
        This page shows only what the firm released to {view.provider.shortName}. It does not include other providers&apos; records, the firm&apos;s case notes or its assessment of
        the case.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- answers -- */

function buildAnswers(view: ProviderView, today: string): Answer[] {
  const out: Answer[] = [];
  const lm = view.alive.lastMovement;
  const idx = view.alive.stage ? view.alive.stagesInOrder.indexOf(view.alive.stage) : -1;
  const lmDays = lm ? daysBetween(lm.date, today) : null;
  out.push({
    id: "alive",
    q: "Is the case alive?",
    verdict: view.alive.stage ? "Active" : "Unknown",
    clause: view.alive.stage ? `the case is active, in ${view.alive.stage.toLowerCase()}` : "the case has no stage on record",
    tone: view.alive.stage ? (lmDays !== null && lmDays > 120 ? "caution" : "good") : "quiet",
    detail: lm ? (
      <>
        Last moved <span className="tnum text-ink">{fmtDate(lm.date, { year: false })}</span>
        {lmDays !== null ? <span className="tnum"> ({relDays(-lmDays)})</span> : null}: {lm.text.charAt(0).toLowerCase() + lm.text.slice(1)}.
      </>
    ) : (
      "No updates released yet."
    ),
    picture: (
      <div>
        <ol className="flex gap-1" aria-label={`Step ${idx + 1} of ${view.alive.stagesInOrder.length}`}>
          {view.alive.stagesInOrder.map((s, i) => (
            <li key={s} title={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              {i <= idx ? <span data-step className={cn("block h-full rounded-full", i === idx ? "bg-signal" : "bg-ink")} /> : null}
            </li>
          ))}
        </ol>
        <p className="mt-1.5 flex justify-between text-[11.5px] text-ink-soft">
          <span>{view.alive.stagesInOrder[0]}</span>
          <span className="tnum text-ink">
            {view.alive.stage} · {idx + 1} of {view.alive.stagesInOrder.length}
          </span>
        </p>
      </div>
    ),
  });

  out.push({
    id: "coverage",
    q: "Is there coverage?",
    verdict: view.coverage.exists ? "Yes" : "None on file",
    clause: view.coverage.exists ? (view.coverage.confirmed ? "there is confirmed coverage" : "there is coverage") : "no coverage is on file",
    tone: view.coverage.exists ? (view.coverage.confirmed ? "good" : "caution") : "exposure",
    detail: view.coverage.exists ? (view.coverage.confirmed ? "Confirmed in writing by the insurer." : "On file; not yet confirmed in writing.") : "The firm has no policy on record yet.",
    picture:
      view.coverage.amount !== null ? (
        <p className="flex items-baseline justify-between border-t border-line pt-2.5 text-[13px] text-ink-soft">
          Per person <span className="tnum font-[family-name:var(--font-display)] text-[1.3rem] text-ink">{fmtUsd(view.coverage.amount)}</span>
        </p>
      ) : (
        <p className="flex items-center gap-1.5 border-t border-line pt-2.5 text-[12.5px] text-ink-soft">
          <LockSimpleIcon size={14} aria-hidden /> The firm hasn&apos;t released the amount.
        </p>
      ),
  });

  const att = view.attendance;
  const verdict = !att.released
    ? { v: "Not shared", c: "attendance isn't shared", t: "quiet" as Tone }
    : att.verdict === "yes"
      ? { v: "Yes", c: "your patient is attending", t: "good" as Tone }
      : att.verdict === "booked"
        ? { v: "Booked", c: "visits are booked", t: "caution" as Tone }
        : att.verdict === "not-recently"
          ? { v: "Not lately", c: "your patient hasn't been seen lately", t: "exposure" as Tone }
          : { v: "No visits", c: "no visits are on file", t: "quiet" as Tone };
  out.push({
    id: "attendance",
    q: "Is my patient showing up?",
    verdict: verdict.v,
    clause: verdict.c,
    tone: verdict.t,
    detail: att.released ? (
      <>
        {att.lastSeen ? (
          <>
            Last seen <span className="tnum text-ink">{fmtDate(att.lastSeen, { year: att.lastSeen.slice(0, 4) !== today.slice(0, 4) })}</span>
          </>
        ) : (
          "No dated visit"
        )}
        {att.nextScheduled ? (
          <>
            {" "}
            · next <span className="tnum text-ink">{fmtDate(att.nextScheduled, { year: false })}</span>
          </>
        ) : null}
        .
      </>
    ) : (
      "The firm hasn't released attendance details."
    ),
    picture: att.released ? <WeekStrip points={att.points} today={today} /> : null,
  });

  const n = view.requests.length + view.questions.length;
  const late = view.requests.filter((r) => (r.daysUntilDue ?? 0) < 0).length;
  const first = view.requests[0];
  out.push({
    id: "needs",
    q: "What does the firm need?",
    verdict: n ? `${countWord(n)} ${n === 1 ? "thing" : "things"}` : "Nothing",
    clause: n ? `the firm needs ${countWord(n, true)} ${n === 1 ? "thing" : "things"} from you` : "the firm needs nothing from you right now",
    tone: late ? "exposure" : n ? "caution" : "good",
    detail: first ? (
      <>
        <span className="line-clamp-2 text-ink">{first.title}</span>
        {first.due ? <span className={cn("tnum", (first.daysUntilDue ?? 0) < 0 && "font-medium text-exposure")}>{(first.daysUntilDue ?? 0) < 0 ? `${relDays(first.daysUntilDue)} past the date` : `by ${fmtDate(first.due, { year: false })}`}</span> : null}
      </>
    ) : view.questions[0] ? (
      view.questions[0].text
    ) : (
      "No open requests."
    ),
    picture: n ? (
      <a href="#needs" className="inline-flex items-center gap-1 text-[12.5px] text-signal underline decoration-dotted underline-offset-4 hover:decoration-solid">
        <ArrowDownIcon size={12} aria-hidden /> See {n === 1 ? "the request" : `all ${n}`}
      </a>
    ) : null,
  });
  return out;
}

/** Twelve weeks back and four ahead: one cell per week, filled when there's a dated visit. */
function WeekStrip({ points, today }: { points: ProviderView["attendance"]["points"]; today: string }) {
  const weeks = 16;
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 7 * 12);
  const cells = Array.from({ length: weeks }, (_, i) => {
    const from = new Date(start);
    from.setUTCDate(from.getUTCDate() + i * 7);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 7);
    const f = from.toISOString().slice(0, 10);
    const t = to.toISOString().slice(0, 10);
    const inWeek = points.filter((p) => p.date >= f && p.date < t);
    const future = f > today;
    return { f, seen: inWeek.some((p) => p.kind !== "scheduled"), booked: inWeek.some((p) => p.kind === "scheduled"), future, now: today >= f && today < t };
  });
  const seen = cells.filter((c) => c.seen && !c.future).length;
  return (
    <div>
      <div className="flex h-7 items-end gap-[3px]" role="img" aria-label={`Seen in ${seen} of the last 12 weeks`}>
        {cells.map((c) => (
          <span
            key={c.f}
            data-week
            title={`Week of ${fmtDate(c.f, { year: false })}${c.seen ? ": visit on file" : c.booked ? ": visit booked" : ""}`}
            className={cn(
              "flex-1 rounded-[2px]",
              c.seen ? "h-full bg-ink" : c.booked ? "h-full border-[1.5px] border-dashed border-signal" : "h-2 bg-line",
              c.now && "outline outline-1 outline-offset-1 outline-signal",
            )}
          />
        ))}
      </div>
      <p className="mt-1.5 flex justify-between text-[11.5px] text-ink-soft">
        <span>12 weeks ago</span>
        <span className="tnum text-ink">
          {seen} of 12 weeks seen
        </span>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- detail -- */

const H2 = "font-[family-name:var(--font-display)] text-[1.55rem] leading-tight tracking-[-0.012em] text-ink";

function Needs({ view }: { view: ProviderView }) {
  const n = view.requests.length + view.questions.length;
  return (
    <section data-reveal="below" id="needs" aria-labelledby="needs-h" className="scroll-mt-24">
      <h2 id="needs-h" className={H2}>
        {n ? "What the firm needs from you" : "Nothing needed from you right now"}
      </h2>
      {n ? (
        <ul className="mt-4 flex flex-col gap-3">
          {view.requests.map((r) => {
            const late = (r.daysUntilDue ?? 0) < 0;
            return (
              <li key={r.key} className={cn("rounded-[6px] border bg-card-bg p-4 sm:p-5", late ? "border-exposure/50" : "border-line")}>
                <div className="flex items-start gap-3">
                  <TrayArrowDownIcon size={20} className={cn("mt-0.5 shrink-0", late ? "text-exposure" : "text-ink-soft")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-medium leading-snug text-ink">{r.title}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{r.detail}</p>
                  </div>
                  {r.due ? (
                    <span className={cn("tnum shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium", late ? "bg-exposure-wash text-exposure" : "bg-paper-2 text-ink")}>
                      {late ? `${Math.abs(r.daysUntilDue ?? 0)} days late` : `Due ${fmtDate(r.due, { year: false })}`}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
          {view.questions.map((q) => (
            <li key={q.key} className="flex items-start gap-3 rounded-[6px] border border-dashed border-line-strong p-4 sm:p-5">
              <QuestionIcon size={20} className="mt-0.5 shrink-0 text-exposure" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-snug text-ink">{q.text}</p>
                {q.since ? (
                  <p className="tnum mt-1 text-[13px] text-ink-soft">
                    Recommended {fmtDate(q.since)}
                    {q.days !== null ? `, ${q.days} days ago` : ""}. A date would let the firm close the medical picture.
                  </p>
                ) : null}
              </div>
              {q.days !== null ? (
                <span className="flex shrink-0 flex-col items-end">
                  <span className="tnum font-[family-name:var(--font-display)] text-[1.6rem] leading-none text-exposure">{q.days}</span>
                  <span className="text-[11px] text-ink-soft">days open</span>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Attendance({ view, today }: { view: ProviderView; today: string }) {
  const att = view.attendance;
  if (!att.released) return null;
  const visits = att.points.filter((p) => p.kind !== "scheduled").length;
  return (
    <section data-reveal="below" aria-labelledby="att-h">
      <h2 id="att-h" className={H2}>
        Attendance on the firm&apos;s file
      </h2>
      <p className="mt-1.5 text-[14px] text-ink-soft">
        {visits} dated {visits === 1 ? "record" : "records"} of your care
        {att.gaps.length ? `, ${att.gaps.length} ${att.gaps.length === 1 ? "stretch" : "stretches"} over ${att.gapThresholdDays} days with none` : ", no long gaps"}. Missing visits
        usually mean records the firm hasn&apos;t received yet.
      </p>
      <AttendanceStrip className="mt-5" points={att.points} gaps={att.gaps} today={today} legend />
    </section>
  );
}

function Updates({ view }: { view: ProviderView }) {
  const [all, setAll] = useState(false);
  const feed = [...view.feed].reverse();
  const shown = all ? feed : feed.slice(0, 5);
  return (
    <section data-reveal="below" aria-labelledby="feed-h">
      <h2 id="feed-h" className={H2}>
        Case updates
      </h2>
      {feed.length ? (
        <>
          <ol className="relative mt-4 flex flex-col">
            <span aria-hidden className="absolute bottom-3 left-[0.3rem] top-3 w-px bg-line" />
            <AnimatePresence initial={false}>
              {shown.map((f, i) => (
                <motion.li
                  key={f.key}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={{ duration: 0.22, delay: all ? Math.max(0, i - 5) * 0.03 : 0 }}
                  className="relative grid grid-cols-[1.4rem_minmax(0,1fr)] py-2"
                >
                  <span aria-hidden className={cn("mt-1.5 size-[0.65rem] rounded-full ring-4 ring-paper", i === 0 ? "bg-signal" : "bg-ink")} />
                  <span className="text-[14.5px] leading-snug text-ink">
                    <span className="tnum block text-[12px] text-ink-soft">{fmtDate(f.date)}</span>
                    {f.text}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
          {feed.length > 5 ? (
            <button
              type="button"
              aria-expanded={all}
              onClick={() => setAll((v) => !v)}
              className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[13px] text-ink transition-[border-color,transform] duration-150 hover:border-ink active:scale-[0.97]"
            >
              {all ? <ArrowUpIcon size={13} aria-hidden /> : <ArrowDownIcon size={13} aria-hidden />}
              {all ? "Show fewer" : `Show all ${feed.length}`}
            </button>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-[14px] text-ink-soft">No updates released yet.</p>
      )}
    </section>
  );
}

function Ledger({ view }: { view: ProviderView }) {
  const total = view.bills.reduce((n, b) => n + b.amount, 0);
  return (
    <section data-reveal="below" aria-labelledby="bills-h">
      <h2 id="bills-h" className={H2}>
        Your bills and records
      </h2>
      {view.bills.length ? (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {view.bills.map((b) => (
            <li key={b.key} className="flex items-baseline justify-between gap-3 py-2.5 text-[14px]">
              <span className="min-w-0 text-ink">
                {b.label}
                {b.detail ? <span className="text-ink-soft"> · {b.detail.replace(/^[^,]+,\s*/, "")}</span> : null}
                {b.beingReconciled ? (
                  <span className="mt-0.5 flex items-center gap-1 text-[12.5px] text-caution">
                    <ClockCountdownIcon size={13} aria-hidden /> Being reconciled against your itemised ledger
                  </span>
                ) : null}
              </span>
              <span className="tnum font-[family-name:var(--font-display)] text-[1.15rem] text-ink">{fmtUsd(b.amount)}</span>
            </li>
          ))}
          {view.bills.length > 1 ? (
            <li className="flex justify-between py-2.5 text-[13.5px] text-ink-soft">
              On file in total <span className="tnum text-ink">{fmtUsd(total)}</span>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-3 text-[14px] text-ink-soft">The firm hasn&apos;t logged a bill from you yet.</p>
      )}
      <h3 className="mt-6 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-soft">Records the firm has received</h3>
      {view.records.length ? (
        <ul className="mt-2 flex flex-col gap-1.5 text-[14px] text-ink">
          {view.records.map((r) => (
            <li key={r.key} className="flex items-center gap-2">
              <CheckIcon size={13} weight="bold" className="text-good" aria-hidden />
              <span className="tnum">{fmtDate(r.date)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13.5px] text-ink-soft">None logged yet.</p>
      )}
    </section>
  );
}
