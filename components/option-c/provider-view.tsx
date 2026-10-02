"use client";

import { CheckCircleIcon, LockSimpleIcon, QuestionIcon, XCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { AttendanceStrip, StageTrack } from "@/components/case/viz";
import type { ProviderView } from "@/lib/access";
import { fmtDate, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCommandReveal } from "./reveal";

/**
 * Command, provider edition: the four answers as four instrument tiles,
 * then updates and this provider's own bills. Dense, scannable, nothing else.
 */
export function CommandProvider({ view, shared }: { view: ProviderView; shared?: boolean }) {
  const scope = useCommandReveal<HTMLDivElement>(0.05);
  const today = view.freshness.fetchedAt.slice(0, 10);
  return (
    <div ref={scope} className="mx-auto max-w-[76rem] px-4 pb-16 pt-6 sm:px-6">
      <div className="mb-5">
        <p className="text-[12.5px] text-ink-soft">{shared ? "Shared with" : "Provider view for"} {view.provider.name}</p>
        <h1 className="mt-1 text-[1.75rem] font-semibold tracking-[-0.01em] text-ink">
          {view.patient.name}
          {view.patient.dateOfIncident ? <span className="ml-3 font-[family-name:var(--font-num)] text-[14px] font-normal text-ink-soft">DOI {view.patient.dateOfIncident}</span> : null}
        </h1>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Tile title="Is the case alive?">
          <p className="text-[1.5rem] font-semibold text-ink">{view.alive.stage ? `Yes · ${view.alive.stage}` : "Unknown"}</p>
          <StageTrack stages={view.alive.stagesInOrder} current={view.alive.stage} labels={false} className="mt-3 gap-0.5" />
          {view.alive.lastMovement ? (
            <p className="mt-3 text-[13px] text-ink-soft">
              Last movement <span className="font-[family-name:var(--font-num)] text-ink">{view.alive.lastMovement.date}</span> · {view.alive.lastMovement.text}
            </p>
          ) : null}
        </Tile>
        <Tile title="Is there coverage?">
          <p className="flex items-center gap-2 text-[1.5rem] font-semibold text-ink">
            {view.coverage.exists ? <CheckCircleIcon size={22} weight="fill" className="text-good" aria-hidden /> : <XCircleIcon size={22} className="text-exposure" aria-hidden />}
            {view.coverage.exists ? (view.coverage.confirmed ? "Yes, confirmed" : "Yes, unconfirmed") : "Not confirmed"}
          </p>
          <p className="mt-3 flex items-center gap-1.5 text-[13px] text-ink-soft">
            {view.coverage.amount !== null ? (
              <span className="font-[family-name:var(--font-num)] text-ink">{fmtUsd(view.coverage.amount)} per person</span>
            ) : (
              <>
                <LockSimpleIcon size={14} aria-hidden /> Amount not shared
              </>
            )}
          </p>
        </Tile>
        <Tile title="Is my patient showing up?">
          {view.attendance.released ? (
            <>
              <p className="mb-3 text-[1.5rem] font-semibold text-ink">
                {{ yes: "Yes, recently", booked: "Visits booked", "not-recently": "Not recently", unknown: "No visits on file" }[view.attendance.verdict]}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Last seen", view.attendance.lastSeen ?? "n/a"],
                  ["Next visit", view.attendance.nextScheduled ?? "none"],
                  [`Gaps > ${view.attendance.gapThresholdDays}d`, String(view.attendance.gaps.length)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-[6px] bg-paper-2 px-2.5 py-2">
                    <p className="text-[11px] text-ink-soft">{k}</p>
                    <p className="font-[family-name:var(--font-num)] text-[14px] text-ink">{v}</p>
                  </div>
                ))}
              </div>
              <AttendanceStrip className="mt-4" points={view.attendance.points} gaps={view.attendance.gaps} today={today} legend />
            </>
          ) : (
            <p className="text-[13.5px] text-ink-soft">Attendance not released by the firm.</p>
          )}
        </Tile>
        <Tile title="What does the firm need from me?">
          <ul className="flex flex-col gap-3">
            {view.requests.map((r) => (
              <li key={r.key} className="text-[13.5px]">
                <p className="font-medium text-ink">{r.title}</p>
                <p className="mt-0.5 text-ink-soft">{r.detail}</p>
                {r.due ? (
                  <p className={cn("mt-0.5 font-[family-name:var(--font-num)] text-[12px]", (r.daysUntilDue ?? 0) < 0 ? "text-exposure" : "text-ink-soft")}>
                    due {r.due} ({r.daysUntilDue}d)
                  </p>
                ) : null}
              </li>
            ))}
            {view.questions.map((q) => (
              <li key={q.key} className="flex gap-2 text-[13.5px] text-ink">
                <QuestionIcon size={16} className="mt-0.5 shrink-0 text-exposure" aria-hidden />
                {q.text}
              </li>
            ))}
            {view.requests.length + view.questions.length === 0 ? <li className="text-[13.5px] text-ink-soft">Nothing outstanding.</li> : null}
          </ul>
        </Tile>
        <Tile title="Status updates">
          <ol className="flex max-h-[18rem] flex-col overflow-y-auto">
            {[...view.feed].reverse().map((f) => (
              <li key={f.key} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2 border-t border-line py-1.5 text-[13px] first:border-t-0">
                <span className="font-[family-name:var(--font-num)] text-[12px] text-ink-soft">{f.date}</span>
                <span className="text-ink">{f.text}</span>
              </li>
            ))}
            {view.feed.length === 0 ? <li className="text-[13px] text-ink-soft">No updates released.</li> : null}
          </ol>
        </Tile>
        <Tile title="Your bills and records">
          <ul className="flex flex-col gap-1.5">
            {view.bills.map((b) => (
              <li key={b.key} className="flex justify-between gap-3 text-[13.5px]">
                <span className="text-ink">
                  {b.label}
                  {b.beingReconciled ? <span className="ml-2 rounded bg-caution-wash px-1.5 text-[11.5px] text-caution">being reconciled</span> : null}
                </span>
                <span className="font-[family-name:var(--font-num)] text-ink">{fmtUsd(b.amount)}</span>
              </li>
            ))}
            {view.bills.length === 0 ? <li className="text-[13px] text-ink-soft">No bill logged.</li> : null}
          </ul>
          <p className="mt-4 text-[12px] text-ink-soft">Records received</p>
          <p className="mt-1 font-[family-name:var(--font-num)] text-[12.5px] text-ink">{view.records.map((r) => fmtDate(r.date)).join(", ") || "none"}</p>
        </Tile>
      </div>
    </div>
  );
}

function Tile({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section data-reveal className={cn("flex flex-col rounded-[var(--radius)] border border-line bg-card-bg", className)}>
      <h2 className="border-b border-line px-4 py-2.5 text-[12.5px] font-medium text-ink-soft">{title}</h2>
      <div className="flex-1 p-4">{children}</div>
    </section>
  );
}
