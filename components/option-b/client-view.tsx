"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";
import { canAnimate } from "@/components/case/motion";
import type { ClientView } from "@/lib/access";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const DISPLAY = "font-[family-name:var(--font-display)] [font-variation-settings:'wdth'_92]";

/**
 * Story, client edition: the journey as a vertical path the client scrolls
 * down, with "you are here" marked, then next steps in big plain type.
 */
export function StoryClient({ view }: { view: ClientView }) {
  const root = useRef<HTMLDivElement>(null);
  const idx = view.stage.current ? view.stage.stagesInOrder.indexOf(view.stage.current) : -1;

  useGSAP(
    () => {
      root.current?.closest(".reveal-root")?.classList.add("revealed");
      if (!canAnimate()) return;
      // The completed path fills in as the client scrolls down their own journey.
      gsap.fromTo("[data-path-seg]", { scaleY: 0 }, { scaleY: 1, ease: "none", stagger: 0.5, scrollTrigger: { trigger: "[data-path]", start: "top 75%", end: "center 55%", scrub: true } });
      gsap.set("[data-rise]", { autoAlpha: 0, y: 24 });
      ScrollTrigger.batch("[data-rise]", { start: "top 90%", once: true, onEnter: (b) => gsap.to(b, { autoAlpha: 1, y: 0, stagger: 0.08, duration: 0.8, ease: "expo.out" }) });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="mx-auto max-w-[56rem] px-4 pb-24 pt-28 sm:px-8">
      <h1 className={cn(DISPLAY, "text-[clamp(2.6rem,1.8rem+4vw,5.2rem)] font-extrabold leading-[0.95] tracking-[-0.045em] text-ink")}>
        Hi {view.client.firstName}. Your case is moving.
      </h1>
      {view.lastSpoke ? <p className="tnum mt-4 text-[17px] text-ink-soft">We last spoke on {fmtDate(view.lastSpoke)}.</p> : null}

      <ol data-path className="relative mt-16 flex flex-col pl-10" aria-label={`Step ${idx + 1} of ${view.stage.stagesInOrder.length}`}>
        {view.stage.stagesInOrder.map((s, i) => {
          const isCurrent = i === idx;
          const last = i === view.stage.stagesInOrder.length - 1;
          return (
            <li key={s} aria-current={isCurrent ? "step" : undefined} className={cn("relative", isCurrent ? "pb-6 pt-3" : "py-2.5")}>
              {!last ? (
                <span aria-hidden className={cn("absolute -left-[1.65rem] w-1 rounded-full bg-line", isCurrent ? "top-[2.6rem] bottom-[-0.9rem]" : "top-[1.6rem] bottom-[-0.9rem]")}>
                  {i < idx ? <span data-path-seg className="block size-full origin-top rounded-full bg-signal" /> : null}
                </span>
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "absolute rounded-full border-2",
                  isCurrent ? "-left-[2.05rem] top-[1.55rem] size-5 border-signal bg-paper ring-4 ring-signal-wash" : "-left-[1.95rem] top-[1.05rem] size-4",
                  !isCurrent && (i < idx ? "border-signal bg-signal" : "border-line-strong bg-paper"),
                )}
              />
              <p className={cn(isCurrent ? cn(DISPLAY, "text-[2.2rem] font-extrabold tracking-[-0.03em] text-ink") : i < idx ? "text-[16px] text-ink" : "text-[16px] text-ink-soft")}>
                {s}
                {isCurrent ? <span className="ml-3 align-middle font-[family-name:var(--font-text)] text-[14px] font-medium tracking-normal text-signal">You are here</span> : null}
              </p>
              {isCurrent && view.stage.explainer ? <p className="mt-2 max-w-[34rem] text-[17px] leading-relaxed text-ink">{view.stage.explainer}</p> : null}
            </li>
          );
        })}
      </ol>

      {view.stage.next ? (
        <section data-rise className="mt-16">
          <h2 className={cn(DISPLAY, "text-[2.2rem] font-extrabold tracking-[-0.03em] text-ink")}>What happens next</h2>
          <p className="mt-2 max-w-[38rem] text-[18px] leading-relaxed text-ink">{view.stage.next.explainer}</p>
        </section>
      ) : null}

      <div className="mt-14 grid gap-4 md:grid-cols-2">
        <section data-rise className="rounded-[var(--radius)] border border-line bg-card-bg p-7">
          <h2 className="text-[15px] font-medium text-ink-soft">Your next appointment</h2>
          {view.nextAppointment ? (
            <>
              <p className={cn(DISPLAY, "tnum mt-2 text-[2.4rem] font-extrabold leading-none tracking-[-0.03em] text-ink")}>{fmtDate(view.nextAppointment.date, { year: false })}</p>
              <p className="mt-2 text-[16px] text-ink">{view.nextAppointment.title}</p>
            </>
          ) : (
            <p className="mt-2 text-[16px] text-ink-soft">Nothing booked.</p>
          )}
          {view.upcoming.length > 1 ? (
            <ul className="mt-5 flex flex-col gap-1.5 border-t border-line pt-4 text-[14.5px] text-ink-soft">
              {view.upcoming.slice(1).map((u) => (
                <li key={`${u.date}-${u.title}`}>
                  <span className="tnum font-medium text-ink">{fmtDate(u.date, { year: false })}</span> {u.title}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <section data-rise className="rounded-[var(--radius)] border border-line bg-card-bg p-7">
          <h2 className="text-[15px] font-medium text-ink-soft">What we need from you</h2>
          {view.asks.map((a) => (
            <div key={a.title} className="mt-2">
              <p className={cn(DISPLAY, "text-[1.6rem] font-bold leading-tight tracking-[-0.02em] text-ink")}>{a.title}.</p>
              <p className="mt-2 text-[15px] text-ink-soft">{a.when ? `Bring them to our meeting on ${fmtDate(a.when, { year: false })}, or send them sooner.` : "Send them when you can."}</p>
            </div>
          ))}
          {view.asks.length === 0 ? <p className="mt-2 text-[16px] text-ink">Nothing right now.</p> : null}
          <p className="mt-4 text-[14.5px] text-ink-soft">Keep going to your appointments and note each visit.</p>
        </section>
      </div>

      <section data-rise className="mt-14 rounded-[var(--radius)] bg-signal-wash p-7">
        <h2 className={cn(DISPLAY, "text-[1.8rem] font-extrabold tracking-[-0.03em] text-ink")}>About your final amount</h2>
        <p className="mt-2 max-w-[42rem] text-[16.5px] leading-relaxed text-ink">
          A settlement isn&apos;t what you take home. Medical bills and liens are repaid from it first
          {view.liens.holders.length ? `, and ${view.liens.holders.join(" and ")} has a lien on this case` : ""}. We negotiate those down at the end, and we&apos;ll walk you through
          every number before anything is final.
        </p>
      </section>
    </div>
  );
}
