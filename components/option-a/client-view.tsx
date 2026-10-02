"use client";

import { useGSAP } from "@gsap/react";
import { CalendarBlankIcon, ChatCircleIcon, ClipboardTextIcon, ScalesIcon } from "@phosphor-icons/react";
import gsap from "gsap";
import { useRef } from "react";
import { canAnimate } from "@/components/case/motion";
import type { ClientView } from "@/lib/access";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

/**
 * Briefing, client edition: a calm letter in plain English. Where the case
 * is, what happens next, the next appointment, what we need, and why the
 * final amount depends on liens. No figures, strategy or other parties.
 */
export function BriefingClient({ view }: { view: ClientView }) {
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
        const tl = gsap.timeline({ defaults: { ease: "expo.out" }, onComplete: () => shell?.classList.add("revealed") });
        tl.fromTo("[data-reveal]", { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, stagger: 0.08, duration: 0.6 });
        tl.fromTo("[data-stage-seg]", { scaleX: 0, transformOrigin: "left" }, { scaleX: 1, stagger: 0.06, duration: 0.5 }, 0.2);
      });
      mm.add("(prefers-reduced-motion: reduce)", () => shell?.classList.add("revealed"));
    },
    { scope: root },
  );

  const idx = view.stage.current ? view.stage.stagesInOrder.indexOf(view.stage.current) : -1;

  return (
    <div ref={root} className="mx-auto max-w-[44rem] px-4 pb-24 pt-10 sm:px-8 sm:pt-16">
      <h1 data-reveal className="font-[family-name:var(--font-display)] text-[clamp(2.4rem,2rem+2vw,3.5rem)] leading-[1.04] tracking-[-0.02em] text-ink">
        Hi {view.client.firstName}, here&apos;s where your case stands.
      </h1>
      {view.lastSpoke ? (
        <p data-reveal className="mt-3 flex items-center gap-2 text-[15px] text-ink-soft">
          <ChatCircleIcon size={17} aria-hidden /> We last spoke on <span className="tnum text-ink">{fmtDate(view.lastSpoke)}</span><span>.</span>
        </p>
      ) : null}

      <section data-reveal aria-labelledby="stage-h" className="mt-12">
        <h2 id="stage-h" className="text-[15px] font-semibold text-ink">
          Your case is in step {idx + 1} of {view.stage.stagesInOrder.length}: {view.stage.current}
        </h2>
        <ol className="mt-4 grid grid-cols-4 gap-x-1.5 gap-y-3 sm:grid-cols-8" aria-hidden>
          {view.stage.stagesInOrder.map((s, i) => (
            <li key={s} className="flex flex-col gap-1.5">
              <span data-stage-seg className={cn("h-1.5 rounded-full", i < idx ? "bg-ink" : i === idx ? "bg-signal" : "bg-line")} />
              <span className={cn("text-[12px]", i === idx ? "font-medium text-ink" : "text-ink-soft")}>{s}</span>
            </li>
          ))}
        </ol>
        {view.stage.explainer ? <p className="mt-5 font-[family-name:var(--font-display)] text-[1.3rem] leading-[1.5] text-ink">{view.stage.explainer}</p> : null}
        {view.stage.next ? (
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            <span className="text-ink">What usually happens next.</span> {view.stage.next.explainer}
          </p>
        ) : null}
      </section>

      <div data-reveal className="mt-12 grid gap-px overflow-hidden rounded-[4px] border border-line bg-line sm:grid-cols-2">
        <section className="bg-card-bg p-6">
          <h2 className="flex items-center gap-2 text-[14px] font-medium text-ink-soft">
            <CalendarBlankIcon size={16} aria-hidden /> Your next appointment
          </h2>
          {view.nextAppointment ? (
            <>
              <p className="tnum mt-2 font-[family-name:var(--font-display)] text-[1.7rem] leading-tight text-ink">{fmtDate(view.nextAppointment.date)}</p>
              <p className="mt-1 text-[15px] text-ink">{view.nextAppointment.title}</p>
            </>
          ) : (
            <p className="mt-2 text-[15px] text-ink-soft">Nothing booked right now.</p>
          )}
          {view.upcoming.length > 1 ? (
            <ul className="mt-4 flex flex-col gap-1.5 border-t border-line pt-3 text-[13.5px] text-ink-soft">
              {view.upcoming.slice(1).map((u) => (
                <li key={`${u.date}-${u.title}`}>
                  <span className="tnum text-ink">{fmtDate(u.date, { year: false })}</span> · {u.title}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <section className="bg-card-bg p-6">
          <h2 className="flex items-center gap-2 text-[14px] font-medium text-ink-soft">
            <ClipboardTextIcon size={16} aria-hidden /> What we need from you
          </h2>
          {view.asks.length ? (
            <ul className="mt-2 flex flex-col gap-3">
              {view.asks.map((a) => (
                <li key={a.title}>
                  <p className="text-[16px] leading-snug text-ink">{a.title}.</p>
                  {a.when ? (
                    <p className="mt-1 text-[13.5px] text-ink-soft">
                      Please bring them to our meeting on <span className="tnum text-ink">{fmtDate(a.when)}</span>, or send them sooner if you can.
                    </p>
                  ) : (
                    <p className="mt-1 text-[13.5px] text-ink-soft">Send them whenever you can.</p>
                  )}
                </li>
              ))}
              <li className="text-[13.5px] leading-relaxed text-ink-soft">Keep going to your appointments and keep your own note of each visit.</li>
            </ul>
          ) : (
            <p className="mt-2 text-[15px] text-ink">Nothing right now. Keep going to your appointments.</p>
          )}
        </section>
      </div>

      <section data-reveal aria-labelledby="money-h" className="mt-12">
        <h2 id="money-h" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <ScalesIcon size={17} aria-hidden /> About the amount you&apos;ll take home
        </h2>
        <p className="mt-2 text-[15.5px] leading-[1.65] text-ink">
          Any settlement is not the amount you receive. Before money reaches you, medical bills and liens are paid back from it.
          {view.liens.holders.length ? ` ${view.liens.holders.join(" and ")} has a lien on this case, which means it is repaid from the recovery.` : ""} We
          negotiate those amounts down at the end, which is normal, and we&apos;ll walk you through the numbers before anything is final.
        </p>
      </section>

      {view.feed.length ? (
        <section data-reveal aria-labelledby="progress-h" className="mt-12">
          <h2 id="progress-h" className="text-[15px] font-semibold text-ink">
            Progress so far
          </h2>
          <ol className="mt-3 flex flex-col gap-2.5">
            {[...view.feed].reverse().map((f) => (
              <li key={`${f.date}-${f.text}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 text-[14.5px]">
                <span className="tnum text-ink-soft">{fmtDate(f.date)}</span>
                <span className="text-ink">{f.text}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <p className="mt-16 border-t border-line pt-4 text-[13px] leading-relaxed text-ink-soft">
        Questions? Contact your legal team any time. This page updates from your file, last on <span className="tnum">{fmtDate(view.freshness.fetchedAt)}</span>.
      </p>
    </div>
  );
}
