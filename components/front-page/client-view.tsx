"use client";

import { useGSAP } from "@gsap/react";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ClipboardTextIcon, FirstAidKitIcon, PhoneIcon, UsersThreeIcon } from "@phosphor-icons/react";
import gsap from "gsap";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { canAnimate } from "@/components/case/motion";
import { HATCH } from "@/components/case/viz";
import type { ClientView } from "@/lib/access";
import { daysBetween, fmtDate, relDays } from "@/lib/format";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

/**
 * Front Page, client edition. Plain English, no figures, no strategy. One
 * reassuring sentence answers "where are we and what's next", a path shows
 * the whole journey with a "you are here" marker, a four-week calendar
 * shows what's coming, and a picture (not numbers) explains why the final
 * amount depends on bills and liens.
 */

const longDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

type Kind = "care" | "call" | "meeting";
const kindOf = (title: string): Kind => (/phone call/i.test(title) ? "call" : /meeting|legal team/i.test(title) ? "meeting" : "care");
const KIND_ICON = { care: FirstAidKitIcon, call: PhoneIcon, meeting: UsersThreeIcon };
const KIND_TONE = { care: "bg-signal", call: "bg-ink", meeting: "bg-caution" };

export function FrontPageClient({ view }: { view: ClientView }) {
  const root = useRef<HTMLDivElement>(null);
  const today = view.freshness.fetchedAt.slice(0, 10);
  const idx = view.stage.current ? view.stage.stagesInOrder.indexOf(view.stage.current) : -1;
  const total = view.stage.stagesInOrder.length;

  // Everything dated that's coming up: appointments, plus the meeting where an ask is due.
  const coming = useMemo(() => {
    const items = view.upcoming.map((u) => ({ date: u.date, title: u.title, kind: kindOf(u.title) }));
    for (const a of view.asks)
      if (a.when && !items.some((i) => i.date === a.when && i.kind === "meeting")) items.push({ date: a.when, title: "Meeting with your legal team: bring your documents", kind: "meeting" });
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [view.upcoming, view.asks]);

  useGSAP(
    () => {
      const shell = root.current?.closest(".reveal-root");
      const mm = gsap.matchMedia();
      mm.add({ motion: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
        shell?.classList.add("revealed");
        if (ctx.conditions?.reduce || !canAnimate()) return;
        const tl = gsap.timeline({ defaults: { ease: "expo.out", duration: 0.7 } });
        tl.fromTo("[data-reveal='hello'] > span", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, stagger: 0.12 })
          .fromTo("[data-reveal='path']", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, "<0.3")
          .fromTo("[data-path-fill]", { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: "power2.inOut" }, "<")
          .fromTo("[data-path-fill-v]", { scaleY: 0 }, { scaleY: 1, duration: 1.1, ease: "power2.inOut" }, "<")
          .fromTo("[data-node]", { scale: 0.4, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, stagger: 0.09, duration: 0.45, ease: "back.out(2)" }, "<0.05")
          .fromTo("[data-here]", { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "back.out(2)" }, ">-0.2")
          .fromTo("[data-reveal='card']", { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, stagger: 0.08 }, "<0.1")
          .fromTo("[data-day]", { autoAlpha: 0 }, { autoAlpha: 1, stagger: 0.008, duration: 0.3 }, "<0.2")
          .fromTo("[data-reveal='below']", { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, stagger: 0.08 }, "<0.2");
        return () => tl.kill();
      });
    },
    { scope: root },
  );

  const next = coming[0] ?? null;
  return (
    <div ref={root} className="mx-auto max-w-[64rem] px-4 pb-24 pt-10 sm:px-8 sm:pt-14">
      <h1 data-reveal="hello" className="font-[family-name:var(--font-display)] tracking-[-0.022em] text-ink">
        <span className="block text-[clamp(2.6rem,1.9rem+3vw,4.2rem)] leading-[1]">Hi {view.client.firstName}.</span>
        <span className="mt-3 block max-w-[48rem] text-[clamp(1.4rem,1.1rem+1.3vw,2.1rem)] leading-[1.25] text-ink-soft">
          {idx >= 0 ? (
            <>
              Your case is moving forward. We&apos;re at <span className="text-ink">step {idx + 1} of {total}</span>
            </>
          ) : (
            <>Here&apos;s where things stand</>
          )}
          {next ? (
            <>
              , and your next appointment is <span className="text-ink">{longDay(next.date)}</span>.
            </>
          ) : (
            "."
          )}
        </span>
      </h1>
      <p data-reveal="hello" className="mt-4 text-[14px] text-ink-soft">
        <span>
          {view.lastSpoke ? (
            <>
              We last spoke <span className="tnum text-ink">{fmtDate(view.lastSpoke, { year: false })}</span>
              {" · "}
            </>
          ) : null}
          Updated from your file <span className="tnum">{fmtDate(view.freshness.fetchedAt)}</span>
        </span>
      </p>

      {idx >= 0 ? <Journey view={view} idx={idx} /> : null}

      <div className="mt-12 grid gap-4 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Calendar coming={coming} today={today} />
        <Asks view={view} today={today} />
      </div>

      <TakeHome view={view} />
      <Progress view={view} />

      <p className="mt-16 border-t border-line pt-4 text-[13px] leading-relaxed text-ink-soft">
        Questions? Call or email your legal team any time; there&apos;s no such thing as a small question. This page only shows your own case, in plain English.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- journey -- */

function Journey({ view, idx }: { view: ClientView; idx: number }) {
  const stages = view.stage.stagesInOrder;
  const pct = stages.length > 1 ? (idx / (stages.length - 1)) * 100 : 0;
  return (
    <section data-reveal="path" aria-labelledby="journey-h" className="mt-12 rounded-[8px] border border-line bg-card-bg px-5 pb-6 pt-5 sm:px-8">
      <h2 id="journey-h" className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-soft">
        Your case, start to finish
      </h2>

      {/* Desktop: a horizontal path. */}
      <div className="relative mt-12 hidden md:block">
        <span aria-hidden className="absolute left-[calc(100%/16)] right-[calc(100%/16)] top-[0.7rem] h-[3px] rounded-full bg-line" />
        <span aria-hidden className="absolute left-[calc(100%/16)] right-[calc(100%/16)] top-[0.7rem] h-[3px]">
          <span data-path-fill className="block h-full origin-left rounded-full bg-ink" style={{ width: `${pct}%` }} />
        </span>
        <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
          {stages.map((s, i) => (
            <li key={s} className="flex flex-col items-center text-center" aria-current={i === idx ? "step" : undefined}>
              <Node state={i < idx ? "done" : i === idx ? "here" : "ahead"} />
              <span className={cn("mt-2.5 text-[12.5px] leading-tight [overflow-wrap:anywhere]", i === idx ? "font-semibold text-ink" : i < idx ? "text-ink" : "text-ink-soft")}>{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Phone: the same path, vertical. */}
      <ol className="relative mt-5 flex flex-col gap-3 md:hidden">
        <span aria-hidden className="absolute bottom-3 left-[0.7rem] top-3 w-[3px] -translate-x-1/2 rounded-full bg-line" />
        <span aria-hidden className="absolute left-[0.7rem] top-3 w-[3px] -translate-x-1/2" style={{ height: `calc((100% - 1.5rem) * ${idx / Math.max(1, stages.length - 1)})` }}>
          <span data-path-fill-v className="block h-full origin-top rounded-full bg-ink" />
        </span>
        {stages.map((s, i) => (
          <li key={s} className="relative flex items-center gap-3" aria-current={i === idx ? "step" : undefined}>
            <Node state={i < idx ? "done" : i === idx ? "here" : "ahead"} vertical />
            <span className={cn("text-[14px]", i === idx ? "font-semibold text-ink" : i < idx ? "text-ink" : "text-ink-soft")}>{s}</span>
            {i === idx ? (
              <span data-here className="rounded-full bg-signal px-2 py-0.5 text-[11px] font-semibold text-paper">
                You are here
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="mt-7 grid gap-5 border-t border-line pt-5 md:grid-cols-2 md:gap-10">
        {view.stage.explainer ? (
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-signal">Where we are · {view.stage.current}</p>
            <p className="mt-1.5 font-[family-name:var(--font-display)] text-[1.25rem] leading-[1.45] text-ink">{view.stage.explainer}</p>
          </div>
        ) : null}
        {view.stage.next?.explainer ? (
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-soft">What usually happens next</p>
            <p className="mt-1.5 text-[15.5px] leading-[1.6] text-ink">{view.stage.next.explainer}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Node({ state, vertical }: { state: "done" | "here" | "ahead"; vertical?: boolean }) {
  return (
    <span data-node className="relative grid size-[1.45rem] shrink-0 place-items-center">
      {state === "here" ? (
        <>
          <span aria-hidden className="a2-here-pulse absolute inset-0 rounded-full bg-signal" />
          <span className="relative grid size-full place-items-center rounded-full bg-signal ring-4 ring-card-bg">
            <span className="size-2 rounded-full bg-paper" />
          </span>
          {vertical ? null : (
            <span data-here className="absolute bottom-[calc(100%+0.6rem)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-signal px-2.5 py-1 text-[11.5px] font-semibold text-paper">
              You are here
            </span>
          )}
        </>
      ) : state === "done" ? (
        <span className="grid size-full place-items-center rounded-full bg-ink text-paper ring-4 ring-card-bg">
          <CheckIcon size={12} weight="bold" aria-hidden />
        </span>
      ) : (
        <span className="size-full rounded-full border-2 border-line-strong bg-card-bg ring-4 ring-card-bg" />
      )}
    </span>
  );
}

/* ------------------------------------------------------------- calendar -- */

function Calendar({ coming, today }: { coming: { date: string; title: string; kind: Kind }[]; today: string }) {
  const [hot, setHot] = useState<string | null>(null);
  // From the Monday of this week: four weeks, stretched to six so the next few dates fit.
  const days = useMemo(() => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const monday = d.toISOString().slice(0, 10);
    const last = coming.at(-1)?.date;
    const weeks = Math.min(6, Math.max(4, last ? Math.floor(daysBetween(monday, last) / 7) + 1 : 4));
    return Array.from({ length: weeks * 7 }, (_, i) => {
      const x = new Date(d);
      x.setUTCDate(d.getUTCDate() + i);
      return x.toISOString().slice(0, 10);
    });
  }, [today, coming]);
  const inRange = coming.filter((c) => c.date <= days.at(-1)!);
  const later = coming.length - inRange.length;

  return (
    <section data-reveal="card" aria-labelledby="cal-h" className="rounded-[8px] border border-line bg-card-bg p-5 sm:p-6">
      <h2 id="cal-h" className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-soft">
        Your next {["four", "five", "six"][days.length / 7 - 4]} weeks
      </h2>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center" role="presentation">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="pb-1 text-[11px] text-ink-soft">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const items = coming.filter((c) => c.date === d);
          const past = d < today;
          const isToday = d === today;
          const on = hot === d;
          return (
            <span
              key={d}
              data-day
              onPointerEnter={() => items.length && setHot(d)}
              onPointerLeave={() => setHot(null)}
              title={items.map((i) => i.title).join("\n") || undefined}
              className={cn(
                "relative flex h-11 flex-col items-center justify-center rounded-[6px] text-[13px] transition-colors duration-150",
                past ? "text-ink-soft/50" : "text-ink",
                items.length ? (on ? "bg-signal-wash" : "bg-paper-2") : "",
                isToday && "ring-1 ring-inset ring-signal",
              )}
            >
              <span className={cn("tnum", isToday && "font-semibold text-signal")}>{Number(d.slice(8))}</span>
              {d.slice(8) === "01" ? <span className="absolute left-1 top-0.5 text-[9px] uppercase text-ink-soft">{fmtDate(d, { year: false }).split(" ")[0]}</span> : null}
              {items.length ? (
                <span className="mt-0.5 flex gap-0.5" aria-hidden>
                  {items.map((it, i) => (
                    <span key={i} className={cn("size-1.5 rounded-full", KIND_TONE[it.kind])} />
                  ))}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
      <ul className="mt-4 flex flex-col">
        {inRange.map((c) => {
          const Icon = KIND_ICON[c.kind];
          const n = daysBetween(today, c.date);
          return (
            <li
              key={`${c.date}-${c.title}`}
              onPointerEnter={() => setHot(c.date)}
              onPointerLeave={() => setHot(null)}
              className={cn("grid grid-cols-[1.5rem_4.5rem_minmax(0,1fr)] items-baseline gap-2 border-t border-line py-2 transition-colors duration-150", hot === c.date && "bg-signal-wash/60")}
            >
              <span className={cn("grid size-5 translate-y-1 place-items-center rounded-full text-paper", KIND_TONE[c.kind])}>
                <Icon size={11} weight="fill" aria-hidden />
              </span>
              <span className="tnum text-[13px] text-ink">
                {weekday(c.date)} {fmtDate(c.date, { year: false })}
              </span>
              <span className="min-w-0 text-[14px] leading-snug text-ink">
                {c.title}
                <span className="ml-1.5 text-[12px] text-ink-soft">{relDays(n)}</span>
              </span>
            </li>
          );
        })}
        {!inRange.length ? <li className="border-t border-line py-2 text-[14px] text-ink-soft">Nothing booked in these weeks.</li> : null}
      </ul>
      {later ? <p className="mt-2 text-[12.5px] text-ink-soft">and {later} more later</p> : null}
    </section>
  );
}

function Asks({ view, today }: { view: ClientView; today: string }) {
  return (
    <section data-reveal="card" aria-labelledby="asks-h" className="flex flex-col rounded-[8px] border border-line bg-card-bg p-5 sm:p-6">
      <h2 id="asks-h" className="flex items-center gap-2 text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-soft">
        <ClipboardTextIcon size={14} aria-hidden /> What we need from you
      </h2>
      {view.asks.length ? (
        <ul className="mt-4 flex flex-col gap-4">
          {view.asks.map((a) => (
            <li key={a.title} className="flex gap-3">
              <span className="mt-1 size-5 shrink-0 rounded-[5px] border-2 border-ink" aria-hidden />
              <div>
                <p className="font-[family-name:var(--font-display)] text-[1.3rem] leading-snug text-ink">{a.title}.</p>
                <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
                  {a.when ? (
                    <>
                      Bring them to our meeting on <span className="tnum text-ink">{longDay(a.when)}</span>
                      {daysBetween(today, a.when) >= 0 ? <> ({relDays(daysBetween(today, a.when))})</> : null}, or send them sooner if you can.
                    </>
                  ) : (
                    "Send them whenever you can."
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 font-[family-name:var(--font-display)] text-[1.3rem] leading-snug text-ink">Nothing right now.</p>
      )}
      <div className="mt-auto pt-6">
        <p className="flex gap-3 rounded-[6px] bg-paper-2 p-3.5 text-[14px] leading-relaxed text-ink">
          <FirstAidKitIcon size={18} className="mt-0.5 shrink-0 text-signal" aria-hidden />
          Keep going to your appointments, and jot down how you feel after each one. It helps your recovery and your case.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ take home -- */

function TakeHome({ view }: { view: ClientView }) {
  const liens = view.liens.holders;
  return (
    <section data-reveal="below" aria-labelledby="money-h" className="mt-14">
      <h2 id="money-h" className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,1.3rem+0.8vw,1.9rem)] leading-tight text-ink">
        Why the settlement isn&apos;t what you take home
      </h2>
      <div className="mt-5 grid gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-center">
        <figure aria-label="Illustration: a settlement first repays medical bills and liens, and the rest is your share. Not to scale.">
          <div className="flex flex-col gap-2.5">
            <div>
              <p className="mb-1 text-[12.5px] text-ink-soft">1 · The settlement</p>
              <div className="h-9 rounded-[5px] bg-ink" />
            </div>
            <div>
              <p className="mb-1 text-[12.5px] text-ink-soft">2 · Bills and liens are paid back first</p>
              <div className="flex h-9 gap-1">
                <div className="w-[38%] rounded-[5px]" style={{ backgroundImage: HATCH("var(--caution)"), backgroundColor: "var(--caution-wash)" }} />
                <div className="flex-1 rounded-[5px] border border-dashed border-line-strong" />
              </div>
            </div>
            <div>
              <p className="mb-1 text-[12.5px] text-ink-soft">3 · What&apos;s left is your share</p>
              <div className="flex h-9 gap-1">
                <div className="w-[38%]" />
                <div className="flex flex-1 items-center rounded-[5px] bg-signal px-3 text-[13px] font-medium text-paper">Yours</div>
              </div>
            </div>
          </div>
          <figcaption className="mt-2 text-[12px] text-ink-soft">An illustration, not your numbers.</figcaption>
        </figure>
        <div className="text-[15.5px] leading-[1.65] text-ink">
          <p>Before money reaches you, medical bills and liens are repaid from the settlement.{liens.length ? ` ${liens.join(" and ")} ${liens.length === 1 ? "has" : "have"} a lien on this case, which means ${liens.length === 1 ? "it is" : "they are"} repaid from the recovery.` : ""}</p>
          <p className="mt-3 text-ink-soft">We negotiate those amounts down at the end, which is normal, and we&apos;ll walk you through every number before anything is final.</p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- progress -- */

function Progress({ view }: { view: ClientView }) {
  const [all, setAll] = useState(false);
  if (!view.feed.length) return null;
  const feed = [...view.feed].reverse();
  const shown = all ? feed : feed.slice(0, 4);
  return (
    <section data-reveal="below" aria-labelledby="progress-h" className="mt-14">
      <h2 id="progress-h" className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,1.3rem+0.8vw,1.9rem)] leading-tight text-ink">
        What we&apos;ve done so far
      </h2>
      <ol className="mt-4 grid gap-x-10 sm:grid-cols-2">
        <AnimatePresence initial={false}>
          {shown.map((f, i) => (
            <motion.li
              key={`${f.date}-${f.text}`}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.22, delay: all ? Math.max(0, i - 4) * 0.03 : 0 }}
              className="flex items-start gap-3 border-t border-line py-3"
            >
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-good-wash text-good">
                <CheckIcon size={11} weight="bold" aria-hidden />
              </span>
              <span className="text-[15px] leading-snug text-ink">
                {f.text}
                <span className="tnum block text-[12.5px] text-ink-soft">{fmtDate(f.date)}</span>
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {feed.length > 4 ? (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll((v) => !v)}
          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-4 text-[13.5px] text-ink transition-[border-color,transform] duration-150 hover:border-ink active:scale-[0.97]"
        >
          {all ? <ArrowUpIcon size={13} aria-hidden /> : <ArrowDownIcon size={13} aria-hidden />}
          {all ? "Show less" : `Show all ${feed.length} steps`}
        </button>
      ) : null}
    </section>
  );
}
