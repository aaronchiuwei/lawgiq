"use client";

import { useGSAP } from "@gsap/react";
import { CheckCircleIcon, LockSimpleIcon, XCircleIcon } from "@phosphor-icons/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef, type ReactNode } from "react";
import { canAnimate } from "@/components/case/motion";
import { AttendanceStrip, StageTrack } from "@/components/case/viz";
import type { ProviderView } from "@/lib/access";
import { fmtDate, fmtUsd, relDays } from "@/lib/format";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const DISPLAY = "font-[family-name:var(--font-display)] [font-variation-settings:'wdth'_92]";

/**
 * Story, provider edition: four answers as four big statements, each
 * readable in a second, then updates and this provider's own bills.
 */
export function StoryProvider({ view, shared }: { view: ProviderView; shared?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const shell = root.current?.closest(".reveal-root");
      shell?.classList.add("revealed");
      if (!canAnimate()) return;
      gsap.set("[data-rise]", { autoAlpha: 0, y: 24 });
      ScrollTrigger.batch("[data-rise]", {
        start: "top 90%",
        once: true,
        onEnter: (b) => gsap.to(b, { autoAlpha: 1, y: 0, stagger: 0.08, duration: 0.8, ease: "expo.out" }),
      });
    },
    { scope: root },
  );
  const today = view.freshness.fetchedAt.slice(0, 10);

  return (
    <div ref={root} className="mx-auto max-w-[72rem] px-4 pb-24 pt-28 sm:px-8">
      <header data-rise>
        <p className="text-[15px] text-ink-soft">
          {shared ? "Shared with" : "What the firm shares with"} <span className="font-medium text-ink">{view.provider.name}</span>
        </p>
        <h1 className={cn(DISPLAY, "mt-3 max-w-[50rem] text-[clamp(2.6rem,1.6rem+4vw,5.5rem)] font-extrabold leading-[0.92] tracking-[-0.045em] text-ink")}>
          {view.patient.name}
        </h1>
        {view.patient.dateOfIncident ? <p className="tnum mt-3 text-[16px] text-ink-soft">Injured {fmtDate(view.patient.dateOfIncident)}</p> : null}
      </header>

      <div className="mt-16 flex flex-col gap-4">
        <Band n="Is the case alive?">
          <Statement>{view.alive.stage ? `Yes, it's in ${view.alive.stage.toLowerCase()}.` : "Stage not recorded."}</Statement>
          <div className="max-w-[28rem]">
            <StageTrack stages={view.alive.stagesInOrder} current={view.alive.stage} className="gap-1" />
            {view.alive.lastMovement ? (
              <p className="mt-3 text-[15px] text-ink-soft">
                Last movement <span className="tnum font-medium text-ink">{fmtDate(view.alive.lastMovement.date)}</span>: {view.alive.lastMovement.text.toLowerCase()}.
              </p>
            ) : null}
          </div>
        </Band>

        <Band n="Is there coverage?">
          <Statement className="flex items-center gap-3">
            {view.coverage.exists ? <CheckCircleIcon size={44} weight="fill" className="shrink-0 text-good" aria-hidden /> : <XCircleIcon size={44} className="shrink-0 text-exposure" aria-hidden />}
            {view.coverage.exists ? (view.coverage.confirmed ? "Yes, confirmed." : "Yes, unconfirmed.") : "Not confirmed."}
          </Statement>
          <p className="flex items-center gap-2 text-[16px] text-ink-soft">
            {view.coverage.amount !== null ? (
              <span className="tnum text-ink">{fmtUsd(view.coverage.amount)} per person</span>
            ) : (
              <>
                <LockSimpleIcon size={16} aria-hidden /> Amount not released by the firm
              </>
            )}
          </p>
        </Band>

        <Band n="Is my patient showing up?">
          {view.attendance.released ? (
            <>
              <Statement>
                {{ yes: "Yes, recently.", booked: "Visits are booked.", "not-recently": "Not recently.", unknown: "No visits on file." }[view.attendance.verdict]}
              </Statement>
              <p className="text-[16px] text-ink-soft">
                {view.attendance.lastSeen ? `Last dated record ${fmtDate(view.attendance.lastSeen)}. ` : ""}
                {view.attendance.nextScheduled ? `Next visit ${fmtDate(view.attendance.nextScheduled)}.` : ""}
              </p>
              <div className="w-full max-w-[34rem]">
                <AttendanceStrip points={view.attendance.points} gaps={view.attendance.gaps} today={today} legend />
                <p className="mt-2 text-[14px] text-ink-soft">
                  {view.attendance.gaps.length
                    ? `${view.attendance.gaps.length} gap${view.attendance.gaps.length > 1 ? "s" : ""} over ${view.attendance.gapThresholdDays} days with no dated record.`
                    : "No gaps on file."}
                </p>
              </div>
            </>
          ) : (
            <p className="text-[16px] text-ink-soft">Attendance details not released by the firm.</p>
          )}
        </Band>

        <Band n="What does the firm need from me?">
          {view.requests.length || view.questions.length ? (
            <ul className="flex w-full flex-col gap-4">
              {view.requests.map((r) => (
                <li key={r.key} className="max-w-[40rem]">
                  <p className={cn(DISPLAY, "text-[clamp(1.4rem,1.1rem+1vw,2rem)] font-bold leading-tight tracking-[-0.02em] text-ink")}>{r.title}</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{r.detail}</p>
                  {r.due ? (
                    <p className={cn("tnum mt-1 text-[14px] font-medium", (r.daysUntilDue ?? 0) < 0 ? "text-exposure" : "text-ink-soft")}>
                      Due {fmtDate(r.due)}, {relDays(r.daysUntilDue)}
                    </p>
                  ) : null}
                </li>
              ))}
              {view.questions.map((q) => (
                <li key={q.key} className="max-w-[40rem] rounded-[calc(var(--radius)-4px)] bg-exposure-wash px-4 py-3 text-[15px] text-ink">
                  {q.text}
                </li>
              ))}
            </ul>
          ) : (
            <Statement>Nothing right now.</Statement>
          )}
        </Band>
      </div>

      <div className="mt-20 grid gap-14 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section data-rise aria-labelledby="pf-h">
          <h2 id="pf-h" className={cn(DISPLAY, "text-[2rem] font-extrabold tracking-[-0.03em] text-ink")}>
            Updates
          </h2>
          <ol className="mt-4 flex flex-col">
            {[...view.feed].reverse().map((f) => (
              <li key={f.key} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-t border-line py-2.5 text-[15px]">
                <span className="tnum text-ink-soft">{fmtDate(f.date)}</span>
                <span className="text-ink">{f.text}</span>
              </li>
            ))}
            {view.feed.length === 0 ? <li className="text-[15px] text-ink-soft">No updates released.</li> : null}
          </ol>
        </section>
        <section data-rise aria-labelledby="pb-h">
          <h2 id="pb-h" className={cn(DISPLAY, "text-[2rem] font-extrabold tracking-[-0.03em] text-ink")}>
            Your bills
          </h2>
          <ul className="mt-4">
            {view.bills.map((b) => (
              <li key={b.key} className="flex items-baseline justify-between gap-3 border-t border-line py-2.5 text-[15px]">
                <span className="text-ink">
                  {b.label}
                  {b.beingReconciled ? <span className="block text-[13px] text-caution">Being reconciled against your ledger</span> : null}
                </span>
                <span className="tnum font-semibold text-ink">{fmtUsd(b.amount)}</span>
              </li>
            ))}
            {view.bills.length === 0 ? <li className="text-[15px] text-ink-soft">No bill logged from you yet.</li> : null}
          </ul>
          <h3 className="mt-8 text-[16px] font-semibold text-ink">Records received</h3>
          <ul className="mt-2 text-[14.5px] text-ink-soft">
            {view.records.map((r) => (
              <li key={r.key} className="tnum">
                {fmtDate(r.date)}
              </li>
            ))}
            {view.records.length === 0 ? <li>None logged.</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Band({ n, children }: { n: string; children: ReactNode }) {
  return (
    <section data-rise className="grid gap-5 rounded-[var(--radius)] border border-line bg-card-bg p-6 sm:p-9 md:grid-cols-[14rem_minmax(0,1fr)] md:items-start">
      <h2 className="pt-1 text-[15px] font-medium text-ink-soft">{n}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Statement({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn(DISPLAY, "text-[clamp(1.9rem,1.3rem+2.4vw,3.4rem)] font-extrabold leading-[1] tracking-[-0.035em] text-ink", className)}>{children}</p>;
}
