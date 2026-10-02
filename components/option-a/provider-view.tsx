"use client";

import { useGSAP } from "@gsap/react";
import { CheckCircleIcon, LockSimpleIcon, QuestionIcon, XCircleIcon } from "@phosphor-icons/react";
import gsap from "gsap";
import { useRef } from "react";
import { canAnimate } from "@/components/case/motion";
import { AttendanceStrip, StageTrack } from "@/components/case/viz";
import type { ProviderView } from "@/lib/access";
import { fmtDate, fmtUsd, relDays } from "@/lib/format";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

/**
 * Briefing, provider edition: a one-page status letter. Four answers above
 * the fold, then the plain-English feed and only this provider's bills and
 * records. Every value here was cut by lib/access before it reached the page.
 */
export function BriefingProvider({ view, shared }: { view: ProviderView; shared?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const shell = root.current?.closest(".reveal-root");
      const mm = gsap.matchMedia();
      if (!canAnimate()) {
        shell?.classList.add("revealed");
        return;
      }
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo("[data-reveal]", { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, stagger: 0.08, duration: 0.6, ease: "expo.out", onComplete: () => shell?.classList.add("revealed") });
      });
      mm.add("(prefers-reduced-motion: reduce)", () => shell?.classList.add("revealed"));
    },
    { scope: root },
  );

  const today = view.freshness.fetchedAt.slice(0, 10);
  const lm = view.alive.lastMovement;

  return (
    <div ref={root} className="mx-auto max-w-[62rem] px-4 pb-24 pt-10 sm:px-8 sm:pt-14">
      <header data-reveal>
        <p className="text-[14px] text-ink-soft">
          {shared ? "Shared with" : "Preview of what the firm shares with"} <span className="text-ink">{view.provider.name}</span>
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-[clamp(2.2rem,1.7rem+2vw,3.4rem)] leading-[1.02] tracking-[-0.02em] text-ink">
          Status of your patient {view.patient.name}&apos;s case
        </h1>
        {view.patient.dateOfIncident ? (
          <p className="mt-2 text-[14.5px] text-ink-soft">
            Injury date <span className="tnum text-ink">{fmtDate(view.patient.dateOfIncident)}</span>
          </p>
        ) : null}
      </header>

      <div data-reveal className="mt-10 grid gap-px overflow-hidden rounded-[4px] border border-line bg-line sm:grid-cols-2">
        <Answer q="Is the case alive?">
          <p className="text-[1.6rem] font-[family-name:var(--font-display)] leading-tight text-ink">{view.alive.stage ? `Yes. In ${view.alive.stage.toLowerCase()}.` : "Stage not recorded"}</p>
          {lm ? (
            <p className="mt-1.5 text-[13.5px] text-ink-soft">
              Last real movement <span className="tnum text-ink">{fmtDate(lm.date)}</span>: {lm.text.charAt(0).toLowerCase() + lm.text.slice(1)}.
            </p>
          ) : null}
          <StageTrack stages={view.alive.stagesInOrder} current={view.alive.stage} labels={false} className="mt-4 gap-1" />
          {view.alive.explainer ? <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">{view.alive.explainer}</p> : null}
        </Answer>

        <Answer q="Is there coverage?">
          <p className="flex items-center gap-2 text-[1.6rem] font-[family-name:var(--font-display)] leading-tight text-ink">
            {view.coverage.exists ? <CheckCircleIcon size={24} weight="fill" className="text-good" aria-hidden /> : <XCircleIcon size={24} className="text-exposure" aria-hidden />}
            {view.coverage.exists ? "Yes" : "None confirmed"}
          </p>
          {view.coverage.exists ? (
            <p className="mt-1.5 text-[13.5px] text-ink-soft">
              {view.coverage.confirmed ? "Confirmed in writing by the insurer." : "Not yet confirmed in writing."}
            </p>
          ) : null}
          <p className="mt-3 flex items-center gap-1.5 text-[13.5px]">
            {view.coverage.amount !== null ? (
              <span className="tnum text-ink">{fmtUsd(view.coverage.amount)} per person</span>
            ) : (
              <span className="flex items-center gap-1.5 text-ink-soft">
                <LockSimpleIcon size={14} aria-hidden /> The firm hasn&apos;t released the amount.
              </span>
            )}
          </p>
        </Answer>

        <Answer q="Is my patient showing up?">
          {view.attendance.released ? (
            <>
              <p className="text-[1.6rem] font-[family-name:var(--font-display)] leading-tight text-ink">
                {view.attendance.verdict === "yes"
                  ? "Yes, recently."
                  : view.attendance.verdict === "booked"
                    ? "Visits are booked."
                    : view.attendance.verdict === "not-recently"
                      ? "Not recently."
                      : "No visits on file."}
              </p>
              <p className="mt-1.5 text-[13.5px] text-ink-soft">
                {view.attendance.lastSeen ? (
                  <>
                    Last dated record <span className="tnum text-ink">{fmtDate(view.attendance.lastSeen)}</span>.{" "}
                  </>
                ) : null}
                {view.attendance.nextScheduled ? (
                  <>
                    Next visit <span className="tnum text-ink">{fmtDate(view.attendance.nextScheduled)}</span>.{" "}
                  </>
                ) : null}
                {view.attendance.gaps.length
                  ? `${view.attendance.gaps.length} stretch${view.attendance.gaps.length > 1 ? "es" : ""} over ${view.attendance.gapThresholdDays} days with no dated record.`
                  : "No gaps on file."}
              </p>
              <AttendanceStrip className="mt-4" points={view.attendance.points} gaps={view.attendance.gaps} today={today} legend />
            </>
          ) : (
            <p className="text-[14px] text-ink-soft">The firm hasn&apos;t released attendance details.</p>
          )}
        </Answer>

        <Answer q="What does the firm need from me?">
          {view.requests.length || view.questions.length ? (
            <ul className="flex flex-col gap-3.5">
              {view.requests.map((r) => (
                <li key={r.key}>
                  <p className="text-[15px] leading-snug text-ink">{r.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">{r.detail}</p>
                  {r.due ? (
                    <p className={cn("tnum mt-1 text-[12.5px]", (r.daysUntilDue ?? 0) < 0 ? "font-medium text-exposure" : "text-ink-soft")}>
                      Requested by {fmtDate(r.due)} ({relDays(r.daysUntilDue)})
                    </p>
                  ) : null}
                </li>
              ))}
              {view.questions.map((q) => (
                <li key={q.key} className="flex gap-2 text-[14px] text-ink">
                  <QuestionIcon size={17} className="mt-0.5 shrink-0 text-exposure" aria-hidden />
                  <span>
                    {q.text} {q.since ? <span className="tnum text-ink-soft">Recommended {fmtDate(q.since)}.</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[1.6rem] font-[family-name:var(--font-display)] leading-tight text-ink">Nothing right now.</p>
          )}
        </Answer>
      </div>

      <div className="mt-14 grid gap-12 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section data-reveal aria-labelledby="feed-h">
          <h2 id="feed-h" className="font-[family-name:var(--font-display)] text-[1.6rem] text-ink">
            Case updates
          </h2>
          {view.feed.length ? (
            <ol className="mt-4 flex flex-col gap-3 border-l border-line pl-5">
              {[...view.feed].reverse().map((f) => (
                <li key={f.key} className="relative text-[14.5px] leading-snug text-ink">
                  <span aria-hidden className="absolute -left-[1.6rem] top-1.5 size-2 rounded-full bg-ink ring-4 ring-paper" />
                  <span className="tnum block text-[12.5px] text-ink-soft">{fmtDate(f.date)}</span>
                  {f.text}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-[14px] text-ink-soft">No updates released yet.</p>
          )}
        </section>
        <section data-reveal aria-labelledby="bills-h" className="flex flex-col gap-8">
          <div>
            <h2 id="bills-h" className="font-[family-name:var(--font-display)] text-[1.6rem] text-ink">
              Your bills on file
            </h2>
            {view.bills.length ? (
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {view.bills.map((b) => (
                  <li key={b.key} className="flex items-baseline justify-between gap-3 py-2.5 text-[14px]">
                    <span className="text-ink">
                      {b.label}
                      {b.detail ? <span className="text-ink-soft"> · {b.detail.replace(/^[^,]+,\s*/, "")}</span> : null}
                      {b.beingReconciled ? <span className="block text-[12.5px] text-caution">Being reconciled against your itemised ledger</span> : null}
                    </span>
                    <span className="tnum text-ink">{fmtUsd(b.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[14px] text-ink-soft">The firm hasn&apos;t logged a bill from you yet.</p>
            )}
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Your records received</h2>
            {view.records.length ? (
              <ul className="mt-2 flex flex-col gap-1.5 text-[13.5px] text-ink-soft">
                {view.records.map((r) => (
                  <li key={r.key} className="tnum">
                    {fmtDate(r.date)}: {r.label.toLowerCase()}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13.5px] text-ink-soft">None logged.</p>
            )}
          </div>
        </section>
      </div>
      <p className="mt-16 border-t border-line pt-4 text-[12.5px] leading-relaxed text-ink-soft">
        This page shows only what the firm released to {view.provider.shortName}. It does not include other providers&apos; records or the firm&apos;s case notes.
      </p>
    </div>
  );
}

function Answer({ q, children, reveal }: { q: string; children: React.ReactNode; reveal?: boolean }) {
  return (
    <section data-reveal={reveal ? "" : undefined} className="bg-card-bg p-6 sm:p-7">
      <h2 className="text-[13.5px] font-medium text-ink-soft">{q}</h2>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}
