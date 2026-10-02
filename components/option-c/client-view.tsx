"use client";

import { CalendarBlankIcon, ClipboardTextIcon, ScalesIcon } from "@phosphor-icons/react";

import type { ClientView } from "@/lib/access";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCommandReveal } from "./reveal";

/**
 * Command, client edition: the same instrument language, made gentle. Larger
 * type, plain words, one progress meter, three tiles.
 */
export function CommandClient({ view }: { view: ClientView }) {
  const scope = useCommandReveal<HTMLDivElement>(0.05);
  const idx = view.stage.current ? view.stage.stagesInOrder.indexOf(view.stage.current) : -1;
  const pct = ((idx + 1) / view.stage.stagesInOrder.length) * 100;

  return (
    <div ref={scope} className="mx-auto max-w-[60rem] px-4 pb-16 pt-8 sm:px-6">
      <h1 className="text-[clamp(1.9rem,1.5rem+1.6vw,2.8rem)] font-semibold leading-tight tracking-[-0.015em] text-ink">Hi {view.client.firstName}. Here&apos;s your case today.</h1>
      {view.lastSpoke ? <p className="mt-2 text-[15px] text-ink-soft">We last spoke on {fmtDate(view.lastSpoke)}.</p> : null}

      <section data-reveal className="mt-8 rounded-[var(--radius)] border border-line bg-card-bg p-5" aria-labelledby="cs-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="cs-h" className="text-[1.3rem] font-semibold text-ink">{view.stage.current}</h2>
          <p className="text-[13px] text-ink-soft">
            Step {idx + 1} of {view.stage.stagesInOrder.length}
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper-2" role="progressbar" aria-valuenow={idx + 1} aria-valuemin={1} aria-valuemax={view.stage.stagesInOrder.length} aria-label="Case progress">
          <div className="h-full origin-left rounded-full bg-signal" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-[12px] text-ink-soft">
          {view.stage.stagesInOrder.map((s, i) => (
            <span key={s} className={cn("hidden sm:inline", i === idx && "font-medium text-ink")}>
              {s}
            </span>
          ))}
        </div>
        {view.stage.explainer ? <p className="mt-4 text-[16px] leading-relaxed text-ink">{view.stage.explainer}</p> : null}
        {view.stage.next ? (
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            <span className="text-ink">What usually happens next:</span> {view.stage.next.explainer}
          </p>
        ) : null}
      </section>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <section data-reveal className="rounded-[var(--radius)] border border-line bg-card-bg p-5">
          <h2 className="flex items-center gap-2 text-[13px] font-medium text-ink-soft">
            <CalendarBlankIcon size={15} aria-hidden /> Next appointment
          </h2>
          {view.nextAppointment ? (
            <>
              <p className="mt-2 text-[1.5rem] font-semibold text-ink">{fmtDate(view.nextAppointment.date)}</p>
              <p className="text-[15px] text-ink">{view.nextAppointment.title}</p>
            </>
          ) : (
            <p className="mt-2 text-[15px] text-ink-soft">Nothing booked.</p>
          )}
          <ul className="mt-3 flex flex-col gap-1 text-[13.5px] text-ink-soft">
            {view.upcoming.slice(1).map((u) => (
              <li key={`${u.date}${u.title}`}>
                <span className="text-ink">{fmtDate(u.date, { year: false })}</span> · {u.title}
              </li>
            ))}
          </ul>
        </section>
        <section data-reveal className="rounded-[var(--radius)] border border-line bg-card-bg p-5">
          <h2 className="flex items-center gap-2 text-[13px] font-medium text-ink-soft">
            <ClipboardTextIcon size={15} aria-hidden /> What we need from you
          </h2>
          {view.asks.map((a) => (
            <div key={a.title} className="mt-2">
              <p className="text-[16px] font-medium text-ink">{a.title}</p>
              <p className="text-[14px] text-ink-soft">{a.when ? `Bring them on ${fmtDate(a.when, { year: false })}, or send sooner.` : "Send when you can."}</p>
            </div>
          ))}
          {view.asks.length === 0 ? <p className="mt-2 text-[15px] text-ink">Nothing right now.</p> : null}
          <p className="mt-3 text-[13.5px] text-ink-soft">Keep going to your appointments.</p>
        </section>
      </div>

      <section data-reveal className="mt-3 rounded-[var(--radius)] border border-line bg-card-bg p-5">
        <h2 className="flex items-center gap-2 text-[13px] font-medium text-ink-soft">
          <ScalesIcon size={15} aria-hidden /> How your settlement gets paid out
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink">
          A settlement isn&apos;t what you take home. Bills and liens are repaid from it first{view.liens.holders.length ? `; ${view.liens.holders.join(" and ")} has a lien here` : ""}. We negotiate them down at the
          end and walk you through every number before anything is final.
        </p>
      </section>

      {view.feed.length ? (
        <section data-reveal className="mt-3 rounded-[var(--radius)] border border-line bg-card-bg p-5">
          <h2 className="text-[13px] font-medium text-ink-soft">Progress so far</h2>
          <ol className="mt-2 flex flex-col">
            {[...view.feed].reverse().map((f) => (
              <li key={`${f.date}${f.text}`} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 border-t border-line py-1.5 text-[14px] first:border-t-0">
                <span className="text-ink-soft">{fmtDate(f.date)}</span>
                <span className="text-ink">{f.text}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
