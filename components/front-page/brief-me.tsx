"use client";

import { CaretLeftIcon, CaretRightIcon, PauseIcon, PlayIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CaseFile } from "@/lib/derive";
import type { CaseHeadlines } from "@/lib/derive/headlines";
import { capitalize, fmtDate, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useFront } from "./state";

/**
 * "Brief me": a ~30 second guided read. A spotlight walks the front page
 * (who, the money, what needs doing, the story, the open question, the
 * score) with one derived sentence per beat. During the story beat the spine
 * plays its ranked moments in order. Space pauses, arrows step, Esc leaves;
 * scrolling or clicking the page pauses too.
 */

type Beat = { id: string; target: string; text: string; ms: number; spine?: boolean };

function beats(c: CaseFile, h: CaseHeadlines): Beat[] {
  const out: Beat[] = [];
  const stageIdx = c.matter.stage ? c.matter.stagesInOrder.indexOf(c.matter.stage) : -1;
  out.push({
    id: "who",
    target: "[data-brief='who']",
    text: `${c.client.name}. ${c.matter.caseType || c.matter.practiceArea || "Matter"}${c.matter.dateOfIncident ? ` on ${fmtDate(c.matter.dateOfIncident.value)}` : ""}.${c.matter.stage ? ` Now in ${c.matter.stage}, stage ${stageIdx + 1} of ${c.matter.stagesInOrder.length}.` : ""}`,
    ms: 4200,
  });
  if (h.money.value !== null && h.money.limit !== null)
    out.push({
      id: "money",
      target: "[data-brief='money']",
      text:
        h.money.gap !== null && h.money.gap > 0
          ? `Worth ${fmtUsd(h.money.value)} against a ${fmtUsd(h.money.limit)} limit: ${fmtUsd(h.money.gap)} has nothing behind it.${h.money.specialsOverLimit ? " Billed specials alone already pass the limit." : ""}`
          : `Worth ${fmtUsd(h.money.value)}, inside the ${fmtUsd(h.money.limit)} limit.`,
      ms: 6000,
    });
  out.push({ id: "needs", target: "[data-brief='needs']", text: `${h.needs.text}${h.needs.sub ? ` ${h.needs.sub}.` : ""}`, ms: 5200 });
  if (c.topEvents.length) out.push({ id: "story", target: "[data-brief='spine']", text: h.story.text, ms: Math.max(5000, c.topEvents.length * 750), spine: true });
  const open = c.treatment.procedures.find((p) => p.status === "recommended" && p.openForDays !== null);
  if (open)
    out.push({
      id: "open",
      target: "[data-spine-open]",
      text: `The open question: ${open.label} was recommended ${fmtDate(open.date)} and still has no date, ${open.openForDays} days on.`,
      ms: 5000,
    });
  out.push({ id: "strength", target: "[data-brief='strength']", text: capitalize(h.strength.text.replace(/^(\d+)\/100/, "Case strength $1 of 100")), ms: 4200 });
  // Only beats whose target is on screen at this width (e.g. the score chip hides on phones).
  return out.filter((b) => (document.querySelector(b.target)?.getClientRects().length ?? 0) > 0);
}

export function BriefMe({ c, h }: { c: CaseFile; h: CaseHeadlines }) {
  const { briefing, setBriefing, setLink } = useFront();
  const list = useMemo(() => (briefing ? beats(c, h) : []), [briefing, c, h]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const started = useRef(0);
  const elapsed = useRef(0);
  const beat = list[i];
  const top = useMemo(() => [...c.topEvents].sort((a, b) => a.date.localeCompare(b.date)), [c.topEvents]);

  const close = useCallback(() => {
    setBriefing(false);
    setLink(null);
    setI(0);
    setPlaying(true);
    setRect(null);
    elapsed.current = 0;
  }, [setBriefing, setLink]);

  const go = useCallback(
    (n: number) => {
      if (n >= list.length) return close();
      elapsed.current = 0;
      started.current = performance.now();
      setLink(null);
      setI(Math.max(0, n));
    },
    [list.length, close, setLink],
  );

  // Bring the target into view, then keep the spotlight on it.
  useEffect(() => {
    if (!briefing || !beat) return;
    const el = document.querySelector<HTMLElement>(beat.target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (r.top < 70 || r.bottom > window.innerHeight - 150) {
      window.scrollTo({ top: Math.max(0, r.top + window.scrollY - Math.max(90, (window.innerHeight - 150 - r.height) / 2)), behavior: reduce ? "auto" : "smooth" });
    }
    // Track the target every frame: it may be scrolling, or settling from a
    // layout animation, and the spotlight should stay locked on either way.
    let raf = 0;
    let last = "";
    const pad = beat.id === "open" ? 14 : 12;
    const track = () => {
      const b = el.getBoundingClientRect();
      const key = `${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.width)},${Math.round(b.height)}`;
      if (key !== last) {
        last = key;
        setRect({ x: b.left - pad, y: b.top - pad, w: b.width + pad * 2, h: b.height + pad * 2 });
      }
      raf = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(raf);
  }, [briefing, beat]);

  // The clock: advance beats, and step the spine's moments during the story beat.
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!briefing || !beat || !playing) return;
    started.current = performance.now() - elapsed.current;
    let raf = 0;
    let lastMoment = -1;
    const tick = () => {
      const t = performance.now() - started.current;
      elapsed.current = t;
      setProgress(Math.min(1, t / beat.ms));
      if (beat.spine && top.length) {
        const m = Math.min(top.length - 1, Math.floor((t / beat.ms) * top.length));
        if (m !== lastMoment) {
          lastMoment = m;
          setLink({ providers: top[m].providerIds, events: [top[m].id], source: "hover" });
        }
      }
      if (t >= beat.ms) return go(i + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [briefing, beat, playing, i, go, top, setLink]);

  // Keys win over the page's own shortcuts while briefing.
  useEffect(() => {
    if (!briefing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === " ") setPlaying((p) => !p);
      else if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    const pause = () => setPlaying(false);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", pause, { passive: true });
    window.addEventListener("touchmove", pause, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("wheel", pause);
      window.removeEventListener("touchmove", pause);
    };
  }, [briefing, close, go, i]);

  const below = rect ? rect.y + rect.h < window.innerHeight - 200 || rect.y < 240 : true;

  return (
    <AnimatePresence>
      {briefing && beat ? (
        <motion.div key="brief" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Guided brief">
          {/* Clicking anywhere on the dimmed page pauses. */}
          <div className="absolute inset-0" onClick={() => setPlaying(false)} aria-hidden />
          {rect ? (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 rounded-[10px] ring-2 ring-signal"
              style={{ boxShadow: "0 0 0 200vmax color-mix(in oklab, var(--ink) 52%, transparent)" }}
              initial={false}
              animate={{ x: rect.x, y: rect.y, width: rect.w, height: rect.h }}
              transition={{ type: "spring", duration: 0.55, bounce: 0.08 }}
            />
          ) : null}
          <motion.div
            layout="position"
            className={cn("absolute left-1/2 w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2", below ? "bottom-6" : "top-20")}
            transition={{ type: "spring", duration: 0.45, bounce: 0.1 }}
          >
            <div className="overflow-hidden rounded-[10px] border border-line bg-card-bg text-ink shadow-[0_24px_64px_-12px_color-mix(in_oklab,var(--ink)_40%,transparent)]">
              <div className="flex gap-1 px-4 pt-3" aria-hidden>
                {list.map((b, n) => (
                  <span key={b.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-line">
                    <span className="block h-full origin-left bg-ink" style={{ transform: `scaleX(${n < i ? 1 : n === i ? progress : 0})` }} />
                  </span>
                ))}
              </div>
              <div className="px-5 pb-4 pt-3" aria-live="polite">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.p
                    key={beat.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                    className="font-[family-name:var(--font-display)] text-[1.25rem] leading-snug"
                  >
                    {beat.text}
                  </motion.p>
                </AnimatePresence>
                <div className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-soft">
                  <span className="tnum mr-auto">
                    {i + 1} of {list.length}
                  </span>
                  <CtlButton label="Previous" onClick={() => go(i - 1)} disabled={i === 0}>
                    <CaretLeftIcon size={14} />
                  </CtlButton>
                  <CtlButton label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)}>
                    {playing ? <PauseIcon size={14} weight="fill" /> : <PlayIcon size={14} weight="fill" />}
                  </CtlButton>
                  <CtlButton label="Next" onClick={() => go(i + 1)}>
                    <CaretRightIcon size={14} />
                  </CtlButton>
                  <CtlButton label="Close the brief" onClick={close}>
                    <XIcon size={14} />
                  </CtlButton>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function CtlButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-8 place-items-center rounded-full border border-line text-ink transition-[background-color,transform] duration-150 hover:bg-paper-2 active:scale-[0.94] disabled:opacity-35"
    >
      {children}
    </button>
  );
}
