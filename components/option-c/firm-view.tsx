"use client";

import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  CheckCircleIcon,
  ClockCountdownIcon,
  CommandIcon,
  MagnifyingGlassIcon,
  QuestionIcon,
  WarningDiamondIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CountUp, DerivedNote, GeneratedLine, NewMark, Portrait } from "@/components/case/atoms";
import { useSync } from "@/components/case/chrome";
import { ConflictFlag, LastVisitDemo, ThresholdStepper } from "@/components/case/controls";
import { ShareEditor } from "@/components/case/share-editor";
import { KIND_ICON, SourceChip, useSources } from "@/components/case/sources";
import { CoverageGauge, SpecialsBars, StageTrack, TreatmentRibbon } from "@/components/case/viz";
import type { FirmView } from "@/lib/access";
import type { CaseFile } from "@/lib/derive";
import { capitalize, fmtDate, fmtUsd, relDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCommandReveal } from "./reveal";

/**
 * Option C, Command. A dense, dark bento of live tiles for the attorney who
 * wants to dig into everything. Lenses reflow the grid and any tile expands
 * to full width with FLIP layout transitions; ⌘K jumps to any tile, record,
 * role or action. Library: Motion, because layout (FLIP) and exit
 * animations are built in and stay interruptible as springs.
 */

type Lens = "all" | "money" | "medical" | "legal" | "risk";
const LENSES: { id: Lens; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "money", label: "Money" },
  { id: "medical", label: "Medical" },
  { id: "legal", label: "Legal" },
  { id: "risk", label: "Risks" },
];

type TileDef = { id: string; title: string; lenses: Lens[]; span: string; render: (expanded: boolean) => ReactNode };

const SPRING = { type: "spring", duration: 0.45, bounce: 0.1 } as const;

export function CommandFirm({ view }: { view: FirmView & { digestPending: boolean } }) {
  const c = view.case;
  const [lens, setLens] = useState<Lens>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const router = useRouter();
  const { sync } = useSync();
  const { open: openSource } = useSources();
  const grid = useCommandReveal<HTMLDivElement>();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === "Escape" && expanded && !paletteOpen) setExpanded(null);
      // 1-5 switch lenses when not typing.
      const target = e.target as HTMLElement;
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !/input|textarea|select/i.test(target.tagName) && !paletteOpen) {
        const n = Number(e.key);
        if (n >= 1 && n <= LENSES.length) setLens(LENSES[n - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, paletteOpen]);

  const tiles = useMemo<TileDef[]>(
    () => [
      { id: "coverage", title: "Value vs coverage", lenses: ["money", "risk"], span: "lg:col-span-8", render: () => <ValueCoverage c={c} /> },
      { id: "identity", title: "Client", lenses: [], span: "lg:col-span-4", render: () => <Identity c={c} photo={view.photo} /> },
      { id: "summary", title: "Case summary", lenses: [], span: "lg:col-span-7", render: () => <Summary c={c} pending={view.digestPending} /> },
      { id: "changes", title: "Since you last opened it", lenses: [], span: "lg:col-span-5", render: () => <Changes c={c} /> },
      { id: "spend", title: "Firm spend", lenses: ["money"], span: "lg:col-span-3", render: (x) => <Spend c={c} expanded={x} /> },
      { id: "deadlines", title: "Deadlines", lenses: ["legal"], span: "lg:col-span-4", render: () => <Deadlines c={c} /> },
      { id: "tasks", title: "Tasks", lenses: ["legal"], span: "lg:col-span-5", render: () => <Tasks c={c} /> },
      { id: "contact", title: "Client contact", lenses: ["legal"], span: "lg:col-span-3", render: () => <Contact c={c} /> },
      { id: "timeline", title: "Timeline", lenses: ["legal", "medical"], span: "lg:col-span-7", render: (x) => <Timeline c={c} expanded={x} /> },
      { id: "score", title: "Case strength", lenses: ["risk"], span: "lg:col-span-5", render: (x) => <Score c={c} expanded={x} /> },
      { id: "treatment", title: "Treatment continuity", lenses: ["medical"], span: "lg:col-span-8", render: () => <Treatment c={c} /> },
      { id: "question", title: "Open question", lenses: ["medical", "risk"], span: "lg:col-span-4", render: () => <OpenQuestion c={c} /> },
      { id: "specials", title: "Medical specials", lenses: ["money", "medical"], span: "lg:col-span-6", render: () => <Specials c={c} /> },
      { id: "liability", title: "Liability", lenses: ["risk", "legal"], span: "lg:col-span-6", render: (x) => <Liability c={c} expanded={x} /> },
      { id: "checks", title: "Records that disagree", lenses: ["risk"], span: "lg:col-span-5", render: () => <Checks c={c} /> },
      { id: "injuries", title: "Injuries", lenses: ["medical"], span: "lg:col-span-7", render: () => <Injuries c={c} /> },
      {
        id: "sharing",
        title: "Provider sharing",
        lenses: ["legal"],
        span: "lg:col-span-12",
        render: () => <ShareEditor drafts={view.providerDrafts} shares={view.shares} previewHref={(id) => `/option-c?role=provider&provider=${encodeURIComponent(id)}`} />,
      },
    ],
    [c, view],
  );

  // A lens shows only its tiles; the expanded tile grows in place (no jump).
  const ordered = tiles.filter((t) => lens === "all" || t.lenses.includes(lens));
  const visible = ordered;

  const jumpTo = (id: string) => {
    setPaletteOpen(false);
    if (!visible.some((t) => t.id === id)) setLens("all");
    requestAnimationFrame(() => {
      const el = document.getElementById(`tile-${id}`);
      el?.scrollIntoView({ block: "center" });
      el?.focus({ preventScroll: true });
      setFlash(id);
      setTimeout(() => setFlash((f) => (f === id ? null : f)), 1200);
    });
  };

  const trigger = (
    <button
      type="button"
      onClick={() => setPaletteOpen(true)}
      className="flex h-8 w-full max-w-[26rem] items-center gap-2 rounded-[6px] border border-line bg-card-bg px-3 text-[13px] text-ink-soft transition-colors duration-150 hover:border-line-strong hover:text-ink"
    >
      <MagnifyingGlassIcon size={14} className="shrink-0" aria-hidden />
      <span className="truncate">Jump to a tile, record or action</span>
      <kbd className="ml-auto flex items-center gap-0.5 rounded border border-line px-1.5 font-[family-name:var(--font-num)] text-[11px]">
        <CommandIcon size={11} aria-hidden />K
      </kbd>
    </button>
  );

  return (
    <div className="mx-auto max-w-[110rem] px-4 pb-16 pt-4 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          role="radiogroup"
          aria-label="Lens (keys 1 to 5)"
          className="flex flex-wrap gap-1"
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            e.preventDefault();
            const i = LENSES.findIndex((l) => l.id === lens);
            const next = LENSES[(i + (e.key === "ArrowRight" ? 1 : LENSES.length - 1)) % LENSES.length];
            setLens(next.id);
            (e.currentTarget.querySelector(`[data-lens="${next.id}"]`) as HTMLElement | null)?.focus();
          }}
        >
          {LENSES.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              data-lens={l.id}
              tabIndex={lens === l.id ? 0 : -1}
              aria-checked={lens === l.id}
              onClick={() => setLens(l.id)}
              className={cn(
                "relative h-8 rounded-[6px] px-3 text-[13px] transition-colors duration-150",
                lens === l.id ? "text-ink" : "text-ink-soft hover:text-ink",
              )}
            >
              {lens === l.id ? <motion.span layoutId="lens-pill" transition={SPRING} className="absolute inset-0 rounded-[6px] border border-line-strong bg-card-bg" /> : null}
              <span className="relative">{l.label}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-1 justify-center px-2">{trigger}</div>
        <p className="text-[12.5px] text-ink-soft">
          <span className="tnum">{visible.length}</span> tiles · {expanded ? "Esc to collapse" : "expand any tile for detail"}
        </p>
      </div>

      <LayoutGroup>
        <div ref={grid} className="grid grid-flow-row-dense grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12">
          <AnimatePresence mode="popLayout" initial={false}>
            {ordered.map((t) => {
              const isExpanded = expanded === t.id;
              return (
                <motion.section
                  key={t.id}
                  id={`tile-${t.id}`}
                  tabIndex={-1}
                  layout
                  aria-labelledby={`h-${t.id}`}
                  transition={SPRING}
                  exit={{ opacity: 0, transform: "scale(0.98)", transition: { duration: 0.14 } }}
                  className={cn(
                    "group relative flex min-w-0 flex-col rounded-[var(--radius)] border bg-card-bg outline-none",
                    isExpanded ? "md:col-span-2 lg:col-span-12" : cn(t.span, t.id === "sharing" && "md:col-span-2"),
                    flash === t.id ? "border-signal shadow-[0_0_0_1px_var(--signal)]" : "border-line",
                    "transition-[border-color,box-shadow] duration-300",
                  )}
                >
                  <div data-reveal className="flex min-h-0 flex-1 flex-col">
                    <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                      <h2 id={`h-${t.id}`} className="text-[12.5px] font-medium text-ink-soft">
                        {t.title}
                      </h2>
                      {t.id !== "identity" && t.id !== "sharing" ? (
                        <button
                          type="button"
                          aria-label={isExpanded ? `Collapse ${t.title}` : `Expand ${t.title}`}
                          aria-expanded={isExpanded}
                          onClick={() => setExpanded(isExpanded ? null : t.id)}
                          className="grid size-7 place-items-center rounded-[5px] text-ink-soft transition-[background-color,color] duration-150 hover:bg-paper-2 hover:text-ink"
                        >
                          {isExpanded ? <ArrowsInSimpleIcon size={14} /> : <ArrowsOutSimpleIcon size={14} />}
                        </button>
                      ) : null}
                    </header>
                    <motion.div layout="position" transition={SPRING} className="min-h-0 flex-1 p-4">
                      {t.render(isExpanded)}
                    </motion.div>
                  </div>
                </motion.section>
              );
            })}
          </AnimatePresence>
        </div>
      </LayoutGroup>

      <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[12px] text-ink-soft">
        <span>Read-only from Clio Manage. Keys: ⌘K jump anywhere · 1 to 5 lenses · Esc collapse.</span>
        <LastVisitDemo />
      </footer>

      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen} title="Jump anywhere" description="Search tiles, records, views and actions" instant className="border border-line sm:max-w-xl">
        <Command className="bg-card-bg">
        <CommandInput placeholder="Type a tile, a record, a provider…" />
        <CommandList className="max-h-[60vh]">
          <CommandEmpty>Nothing matches. Try a provider name, a date or a word from a note.</CommandEmpty>
          <CommandGroup heading="Tiles">
            {tiles.map((t) => (
              <CommandItem key={t.id} value={`tile ${t.title}`} onSelect={() => jumpTo(t.id)}>
                {t.title}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Actions">
            <CommandItem value="sync now refresh clio" onSelect={() => (setPaletteOpen(false), sync())}>
              Sync now with Clio
            </CommandItem>
            {LENSES.map((l) => (
              <CommandItem key={l.id} value={`lens ${l.label}`} onSelect={() => (setLens(l.id), setPaletteOpen(false))}>
                Show lens: {l.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="View as">
            {c.providers.map((p) => (
              <CommandItem key={p.id} value={`view provider ${p.name}`} onSelect={() => router.push(`/option-c?role=provider&provider=${encodeURIComponent(p.id)}`)}>
                Provider: {p.shortName}
              </CommandItem>
            ))}
            <CommandItem value="view client" onSelect={() => router.push("/option-c?role=client")}>
              Client: {c.client.name}
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Records">
            {[...c.events].reverse().map((e) => {
              const I = KIND_ICON[e.source.kind];
              return (
                <CommandItem key={e.id} value={`record ${e.date} ${e.title} ${e.reason ?? ""}`} onSelect={() => (setPaletteOpen(false), openSource([e.source, ...e.duplicates]))}>
                  <I size={14} aria-hidden />
                  <span className="tnum w-[5.5rem] shrink-0 text-ink-soft">{fmtDate(e.date)}</span>
                  <span className="truncate">{e.title}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
        </Command>
      </CommandDialog>
    </div>
  );
}

/* --------------------------------------------------------------- tiles -- */

const BIG = "font-[family-name:var(--font-num)] tnum tracking-[-0.02em] text-ink";

function Identity({ c, photo }: { c: CaseFile; photo: string | null }) {
  return (
    <div>
    <div className="flex gap-4">
      <Portrait name={c.client.name} photo={photo ?? c.client.avatarUrl} editable className="size-[5.5rem] shrink-0 rounded-[8px]" initialsClassName="text-[1.9rem] font-semibold text-signal bg-signal-wash" />
      <div className="min-w-0 flex-1">
        <p className="text-[1.45rem] font-semibold leading-tight tracking-[-0.01em] text-ink">{c.client.name}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-soft">
          <span>{c.matter.caseType}</span>
          {c.matter.dateOfIncident ? (
            <>
              <span>DOI</span>
              <span className="font-[family-name:var(--font-num)] text-ink">{c.matter.dateOfIncident.value}</span>
              <SourceChip sources={c.matter.dateOfIncident.source} variant="icon" className="size-5" />
            </>
          ) : null}
        </p>
        <StageTrack stages={c.matter.stagesInOrder} current={c.matter.stage} className="mt-3 gap-0.5" labels={false} />
        <p className="mt-1.5 text-[12.5px] text-ink">
          {c.matter.stage} <span className="text-ink-soft">· stage {c.matter.stagesInOrder.indexOf(c.matter.stage ?? "") + 1}/{c.matter.stagesInOrder.length}</span>
        </p>
      </div>
      </div>
      <dl className="mt-4 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t border-line pt-3 text-[12.5px]">
        <dt className="text-ink-soft">Opened</dt>
        <dd className="font-[family-name:var(--font-num)] text-ink">{c.matter.openDate}</dd>
        {c.matter.location ? (
          <>
            <dt className="text-ink-soft">Location</dt>
            <dd className="truncate text-ink" title={c.matter.location.value}>
              {c.matter.location.value}
            </dd>
          </>
        ) : null}
        {c.kpis.coverage.claimNumber ? (
          <>
            <dt className="text-ink-soft">Claim</dt>
            <dd className="flex items-center gap-1 text-ink">
              <span className="truncate font-[family-name:var(--font-num)]">{c.kpis.coverage.claimNumber.value.split(" ")[0]}</span>
              <SourceChip sources={c.kpis.coverage.claimNumber.source} variant="icon" className="size-5" />
            </dd>
          </>
        ) : null}
        <dt className="text-ink-soft">Adverse</dt>
        <dd className="truncate text-ink">{c.liability.adverse.map((a) => a.name).join(", ") || "None recorded"}</dd>
        <dt className="text-ink-soft">Treating</dt>
        <dd className="truncate text-ink">{c.providers.length} providers linked in Clio</dd>
      </dl>
    </div>
  );
}

function ValueCoverage({ c }: { c: CaseFile }) {
  const v = c.kpis.estimatedValue;
  const lim = c.kpis.coverage.defendantLimit;
  const gap = c.kpis.coverage.gap;
  const flag = c.conflicts.find((x) => x.anchor === "coverage");
  return (
    <div className="grid h-full gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div>
        <p className="text-[12.5px] text-ink-soft">Above the recorded coverage</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="sync-skel">
            <CountUp value={gap && gap.value > 0 ? gap.value : 0} className={cn(BIG, "text-[3.25rem] leading-none text-exposure")} />
          </span>
          {gap ? <DerivedNote sources={[gap.source, ...(gap.also ?? [])]}>{gap.derivation}</DerivedNote> : null}
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
          {c.kpis.coverage.confirmed ? "Limit confirmed in writing." : "Limit not confirmed."}{" "}
          {flag ? "One record says the defendant is self-insured, so check whose policy this limit is." : null}
        </p>
        {flag ? <ConflictFlag conflict={flag} label="Whose limit is this?" className="mt-2" /> : null}
      </div>
      <div className="flex flex-col justify-between">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[12px] text-ink-soft">Estimated value</p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <span className="sync-skel">
                <CountUp value={v?.value ?? 0} className={cn(BIG, "text-[1.6rem]")} />
              </span>
              <SourceChip sources={v ? [v.source, ...(v.also ?? [])] : null} variant="icon" className="size-5" />
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-[12px] text-ink-soft">
              Per-person limit
              {c.kpis.coverage.confirmed ? <CheckCircleIcon size={12} weight="fill" className="text-good" aria-label="Confirmed in writing" /> : null}
            </p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <span className="sync-skel">
                <CountUp value={lim?.value ?? 0} className={cn(BIG, "text-[1.6rem]")} />
              </span>
              <SourceChip sources={lim ? [lim.source, ...(lim.also ?? [])] : null} variant="icon" className="size-5" />
            </p>
          </div>
        </div>
        <CoverageGauge c={c} className="mt-4" />
      </div>
    </div>
  );
}

function Spend({ c }: { c: CaseFile; expanded?: boolean }) {
  const s = c.kpis.firmSpend;
  return (
    <div>
      <p className="flex items-baseline gap-1.5">
        <span className="sync-skel">
          <CountUp value={s.value} className={cn(BIG, "text-[1.5rem]")} />
        </span>
        <SourceChip sources={s.items.map((i) => i.source)} variant="icon" className="size-5" />
      </p>
      <p className="text-[12.5px] text-ink-soft">{s.count} expense entries</p>
      <ul className="mt-3 flex flex-col gap-1.5 text-[12.5px]">
        {[...s.items].sort((a, b) => b.amount - a.amount).map((i) => (
          <li key={i.source.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
            <span className="truncate text-ink">{i.label}</span>
            <span className="font-[family-name:var(--font-num)] text-ink-soft">{i.date}</span>
            <span className="w-14 text-right font-[family-name:var(--font-num)] text-ink">{fmtUsd(i.amount)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-line pt-2.5 text-[12.5px]">
        <p className="flex items-center justify-between text-ink-soft">
          Medical specials
          <span className="flex items-center gap-1">
            <span className="font-[family-name:var(--font-num)] text-ink">{c.kpis.specials ? fmtUsd(c.kpis.specials.value) : "n/a"}</span>
            {c.kpis.specials?.interim ? <span className="rounded bg-caution-wash px-1.5 text-[11px] text-caution">interim</span> : null}
          </span>
        </p>
        {c.kpis.wageLoss ? (
          <p className="mt-1 flex items-center justify-between text-ink-soft">
            Wage loss claimed
            <span className="flex items-center gap-1">
              <span className="font-[family-name:var(--font-num)] text-ink">{fmtUsd(c.kpis.wageLoss.value)}</span>
              <SourceChip sources={c.kpis.wageLoss.source} variant="icon" className="size-5" />
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Summary({ c, pending }: { c: CaseFile; pending: boolean }) {
  return (
    <div>
      <p className="sync-skel text-[15.5px] leading-[1.6] text-ink">
        <span>
          {c.digest.sentences.map((s, i) => (
            <span key={i}>
              {s.text} <SourceChip sources={s.sources} variant="footnote" footnote={i + 1} />{" "}
            </span>
          ))}
        </span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-soft">
        <DerivedNote kind={c.digest.generator.kind === "ai" ? "ai" : "rules"} sources={c.digest.sentences.flatMap((s) => s.sources)}>
          Generated once per data change and cached. Each sentence cites its records.
        </DerivedNote>
        <GeneratedLine itemCount={c.digest.itemCount} generatedAt={c.digest.generatedAt} generator={c.digest.generator} />
        {pending ? <span className="sync-pulse">AI digest generating</span> : null}
      </div>
    </div>
  );
}

function Changes({ c }: { c: CaseFile }) {
  return (
    <div>
      <p className="text-[12px] text-ink-soft">{c.changes.firstVisit ? "First visit: last 14 days" : `Since ${fmtDate(c.changes.since)}`}</p>
      <ul aria-live="polite" className="mt-2 flex flex-col gap-1">
        {c.changes.items.length === 0 ? <li className="text-[13px] text-ink-soft">No new records.</li> : null}
        {c.changes.items.slice(0, 8).map((e) => {
          return (
            <li key={e.id}>
              <NewMark isNew className="grid grid-cols-[3.4rem_minmax(0,1fr)_auto] items-center gap-2 py-0.5 text-[13px]">
                <span className="font-[family-name:var(--font-num)] text-[12px] text-ink-soft">{e.date.slice(5)}</span>
                <span className="truncate text-ink">{e.title}</span>
                <SourceChip sources={e.source} variant="icon" className="size-5" />
              </NewMark>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Deadlines({ c }: { c: CaseFile }) {
  const sol = c.sol;
  return (
    <div>
      <div className={cn("flex items-start gap-2.5 rounded-[6px] px-3 py-2.5", sol.status === "satisfied" ? "bg-good-wash" : "bg-exposure-wash")}>
        {sol.status === "satisfied" ? <CheckCircleIcon size={16} weight="fill" className="mt-0.5 text-good" aria-hidden /> : <ClockCountdownIcon size={16} className="mt-0.5 text-exposure" aria-hidden />}
        <div className="min-w-0 flex-1 text-[13px]">
          <p className="font-medium text-ink">SOL {sol.status === "satisfied" ? "satisfied" : sol.status === "expired" ? "EXPIRED" : relDays(sol.daysUntil)}</p>
          <p className="font-[family-name:var(--font-num)] text-[12px] text-ink-soft">{sol.date}</p>
        </div>
        <SourceChip sources={sol.sources} variant="icon" className="size-5" />
      </div>
      <ul className="mt-2 divide-y divide-line">
        {c.deadlines.filter((d) => d.kind !== "treatment").map((d) => (
          <li key={d.id} className="grid grid-cols-[3.3rem_minmax(0,1fr)_auto] items-center gap-2 py-1.5 text-[13px]">
            <span className="font-[family-name:var(--font-num)] text-[12px] text-ink-soft">{d.date.slice(5)}</span>
            <span className="truncate text-ink" title={d.title}>
              {d.title}
            </span>
            <span className="flex items-center gap-1">
              <span className="font-[family-name:var(--font-num)] text-[11.5px] text-ink-soft">{d.daysUntil}d</span>
              <SourceChip sources={d.source} variant="icon" className="size-5" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tasks({ c }: { c: CaseFile }) {
  const groups = [
    { label: "Overdue", items: c.tasks.overdue, tone: "text-exposure" },
    { label: "Coming up", items: c.tasks.comingUp, tone: "text-ink" },
    { label: "Waiting on others", items: c.tasks.waiting, tone: "text-caution" },
  ];
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.label}>
          <p className={cn("text-[12px] font-medium", g.tone)}>
            {g.label} <span className="font-[family-name:var(--font-num)]">{g.items.length}</span>
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {g.items.map((t) => (
              <li key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-[13px]">
                <span className="truncate text-ink" title={t.title}>
                  {t.waitingOn ? <span className="text-ink-soft">{t.waitingOn.split(/[\s,]/)[0]}: </span> : null}
                  {t.title}
                </span>
                <span className="flex items-center gap-1.5">
                  {c.conflicts.filter((x) => x.anchor === t.id).map((x) => (
                    <ConflictFlag key={x.id} conflict={x} />
                  ))}
                  <span className={cn("font-[family-name:var(--font-num)] text-[11.5px]", (t.daysUntilDue ?? 0) < 0 ? "text-exposure" : "text-ink-soft")}>
                    {t.daysUntilDue === null ? "n/d" : `${t.daysUntilDue > 0 ? "+" : ""}${t.daysUntilDue}d`}
                  </span>
                  <SourceChip sources={t.source} variant="icon" className="size-5" />
                </span>
              </li>
            ))}
            {g.items.length === 0 ? <li className="text-[12.5px] text-ink-soft">None</li> : null}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Contact({ c }: { c: CaseFile }) {
  const cc = c.clientContact;
  return (
    <div>
      {cc.last ? (
        <>
          <p className={cn(BIG, "text-[1.5rem]", cc.stale && "text-exposure")}>
            {cc.last.daysAgo}
            <span className="ml-1 font-[family-name:var(--font-text)] text-[13px] text-ink-soft">days</span>
          </p>
          <p className="mt-1 text-[12.5px] text-ink-soft">
            <span className="font-[family-name:var(--font-num)] text-ink">{cc.last.date}</span> · {cc.last.channel} <SourceChip sources={cc.last.source} variant="icon" className="size-5 align-middle" />
          </p>
          <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-soft">{cc.last.subject}</p>
        </>
      ) : (
        <p className="text-[13px] text-exposure">No client contact logged.</p>
      )}
      <p className={cn("mt-2 text-[12.5px]", cc.stale ? "text-exposure" : "text-good")}>{cc.stale ? "Over threshold" : "Within threshold"}</p>
      <ThresholdStepper className="mt-2" setting="clientContactStaleDays" value={cc.thresholdDays} label="Flag" />
    </div>
  );
}

function Timeline({ c, expanded }: { c: CaseFile; expanded: boolean }) {
  const [q, setQ] = useState("");
  const list = expanded
    ? [...c.events].reverse().filter((e) => !q || `${e.title} ${e.text} ${e.date}`.toLowerCase().includes(q.toLowerCase()))
    : c.topEvents;
  return (
    <div>
      {expanded ? (
        <label className="mb-3 flex h-8 items-center gap-2 rounded-[6px] border border-line bg-paper-2 px-2.5 text-[13px]">
          <MagnifyingGlassIcon size={14} className="text-ink-soft" aria-hidden />
          <span className="sr-only">Filter the chronology</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${c.events.length} records`} className="w-full bg-transparent text-ink outline-none placeholder:text-ink-soft" />
        </label>
      ) : null}
      <ol className={cn("relative flex flex-col", expanded && "max-h-[34rem] overflow-y-auto pr-1")}>
        {list.map((e) => (
          <li key={e.id} className="grid grid-cols-[5.6rem_minmax(0,1fr)_auto] items-baseline gap-3 border-t border-line py-1.5 first:border-t-0">
            <span className="font-[family-name:var(--font-num)] text-[12px] text-ink-soft">{e.date}</span>
            <span className="min-w-0 text-[13px] leading-snug text-ink">
              {e.title}
              {e.reason && e.ruleId !== "chaser" ? (
                <span className={cn("ml-2 rounded px-1.5 py-px text-[11px]", e.category === "liability" ? "bg-exposure-wash text-exposure" : e.category === "medical" ? "bg-signal-wash text-signal" : "bg-paper-2 text-ink-soft")}>
                  {c.digest.reasons?.[e.id] ?? e.reason}
                </span>
              ) : null}
              {e.date > c.today ? <span className="ml-2 text-[11px] text-signal">upcoming</span> : null}
            </span>
            <SourceChip sources={[e.source, ...e.duplicates]} variant="icon" className="size-5" />
          </li>
        ))}
        {list.length === 0 ? <li className="py-2 text-[13px] text-ink-soft">No records match.</li> : null}
      </ol>
      {!expanded ? <p className="mt-2 text-[12px] text-ink-soft">Top 10 of {c.events.length}. Expand for the full chronology with search.</p> : null}
    </div>
  );
}

function Score({ c, expanded }: { c: CaseFile; expanded: boolean }) {
  const s = c.scorecard;
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <p className={cn(BIG, "text-[1.75rem] leading-none")}>
          {s.total}
          <span className="text-[14px] text-ink-soft">/100</span>
        </p>
        <DerivedNote kind="rules" title="How the score works">
          {s.method}
        </DerivedNote>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {s.factors.map((f) => (
          <li key={f.id}>
            <div className="grid grid-cols-[minmax(0,1fr)_7rem_2.5rem] items-center gap-3 text-[13px]">
              <span className="truncate text-ink">
                {f.label} <span className="font-[family-name:var(--font-num)] text-[11.5px] text-ink-soft">{f.weight}%</span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-paper-2">
                <motion.span
                  className={cn("block h-full origin-left rounded-full", f.score >= 3.5 ? "bg-good" : f.score >= 2 ? "bg-caution" : "bg-exposure")}
                  initial={{ transform: "scaleX(0)" }}
                  whileInView={{ transform: `scaleX(${f.score / 5})` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
                />
              </span>
              <span className="text-right font-[family-name:var(--font-num)] text-[12px] text-ink-soft">{f.score.toFixed(1)}</span>
            </div>
            {expanded ? (
              <ul className="mb-2 ml-1 mt-1.5 flex flex-col gap-1 border-l border-line pl-3">
                {f.evidence.map((ev, i) => (
                  <li key={i} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2 text-[12.5px]">
                    <span className={cn("font-[family-name:var(--font-num)]", ev.delta >= 0 ? "text-good" : "text-exposure")}>
                      {ev.delta >= 0 ? "+" : "−"}
                      {Math.abs(ev.delta)}
                    </span>
                    <span className="text-ink">{ev.text}</span>
                    <SourceChip sources={ev.sources} variant="icon" className="size-5" />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      {!expanded ? <p className="mt-2 text-[12px] text-ink-soft">Expand to see each factor&apos;s evidence.</p> : null}
    </div>
  );
}

function Treatment({ c }: { c: CaseFile }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-ink-soft">Dated records of care per provider; hatched = gap with no record.</p>
        <ThresholdStepper setting="treatmentGapDays" value={c.thresholds.treatmentGapDays} label="Gap" min={14} step={15} />
      </div>
      <TreatmentRibbon c={c} className="[--ribbon-label:10rem]" />
    </div>
  );
}

function OpenQuestion({ c }: { c: CaseFile }) {
  const open = c.treatment.procedures.filter((p) => p.status === "recommended" && p.openForDays !== null);
  if (!open.length) return <p className="text-[13px] text-ink-soft">No recommended procedure is waiting for a date.</p>;
  return (
    <div className="flex flex-col gap-3">
      {open.map((p) => (
        <div key={p.label}>
          <p className="flex items-start gap-2 text-[15px] font-medium leading-snug text-ink">
            <QuestionIcon size={18} className="mt-0.5 shrink-0 text-exposure" aria-hidden />
            {capitalize(p.label)}: recommended, never scheduled
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            {[
              ["Recommended", p.date ?? "n/a"],
              ["Days open", String(p.openForDays)],
              ["Approaches", String(p.followUps)],
            ].map(([k, val]) => (
              <div key={k} className="rounded-[6px] bg-paper-2 px-2.5 py-2">
                <dt className="text-[11px] text-ink-soft">{k}</dt>
                <dd className="font-[family-name:var(--font-num)] text-[14px] text-ink">{val}</dd>
              </div>
            ))}
          </dl>
          <SourceChip sources={[p.source, ...p.also]} className="mt-3" />
        </div>
      ))}
    </div>
  );
}

function Specials({ c }: { c: CaseFile }) {
  return (
    <div>
      <p className="mb-3 flex items-baseline gap-2">
        <span className={cn(BIG, "text-[1.6rem]")}>{c.kpis.specials ? fmtUsd(c.kpis.specials.value) : "n/a"}</span>
        {c.kpis.specials?.interim ? (
          <span className="flex items-center gap-1 rounded bg-caution-wash px-1.5 text-[11.5px] text-caution">
            interim <SourceChip sources={c.kpis.specials.interimReason} variant="icon" className="size-4 text-caution" />
          </span>
        ) : null}
        <SourceChip sources={c.kpis.specials?.source} variant="icon" className="size-5" />
      </p>
      <motion.div initial={{ opacity: 0.001 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
        <SpecialsBars c={c} compact />
      </motion.div>
    </div>
  );
}

function Liability({ c, expanded }: { c: CaseFile; expanded: boolean }) {
  const l = c.liability;
  return (
    <div>
      {l.crux ? (
        <div className="rounded-[6px] border border-exposure/40 bg-exposure-wash px-3 py-2.5">
          <p className="text-[12px] font-medium text-exposure">Crux: {l.crux.question.toLowerCase()}</p>
          <p className="mt-1 text-[13.5px] leading-snug text-ink">
            {l.crux.text} <SourceChip sources={l.crux.source} variant="icon" className="size-5 align-middle" />
          </p>
        </div>
      ) : null}
      <p className="mt-3 text-[12.5px] text-ink-soft">
        Adverse: {l.adverse.map((a) => a.name).join(", ")}
        {l.assessment ? ` · ${l.assessment.text}` : ""}
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {(expanded ? l.risks : l.risks.slice(0, 5)).map((r) => (
          <li key={r.id} className="grid grid-cols-[3.2rem_minmax(0,1fr)_auto] items-center gap-2 text-[13px]">
            <span className={cn("text-[11.5px] font-medium", r.severity === 3 ? "text-exposure" : r.severity === 2 ? "text-caution" : "text-ink-soft")}>
              {r.severity === 3 ? "High" : r.severity === 2 ? "Med" : "Low"}
            </span>
            <span className="truncate text-ink" title={r.label}>
              {r.label}
            </span>
            <SourceChip sources={r.sources} variant="icon" className="size-5" />
          </li>
        ))}
      </ul>
      {expanded && l.mechanism ? (
        <p className="mt-3 border-t border-line pt-3 text-[13.5px] leading-relaxed text-ink">
          <span className="text-ink-soft">Client&apos;s account at intake: </span>
          {l.mechanism.text} <SourceChip sources={l.mechanism.source} variant="icon" className="size-5 align-middle" />
        </p>
      ) : !expanded && l.risks.length > 5 ? (
        <p className="mt-2 text-[12px] text-ink-soft">+{l.risks.length - 5} more risks. Expand to see all.</p>
      ) : null}
    </div>
  );
}

function Checks({ c }: { c: CaseFile }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {c.conflicts.map((x) => (
        <li key={x.id} className="flex gap-2 text-[13px]">
          <WarningDiamondIcon size={15} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium text-ink">{x.title}</p>
            <p className="text-[12.5px] leading-snug text-ink-soft">{x.detail}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {x.sources.map((s, i) => (
                <SourceChip key={`${s.id}-${i}`} sources={s} />
              ))}
            </div>
          </div>
        </li>
      ))}
      {c.conflicts.length === 0 ? <li className="text-[13px] text-ink-soft">No conflicting records found.</li> : null}
    </ul>
  );
}

function Injuries({ c }: { c: CaseFile }) {
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {c.treatment.injuries.map((inj) => (
        <div key={inj.region} className="text-[13px]">
          <p className="flex items-center gap-1.5 font-medium text-ink">
            {inj.region} <SourceChip sources={inj.claimedIn} variant="icon" className="size-5" />
          </p>
          {inj.imaging.map((s) => (
            <p key={s.study} className="mt-0.5 line-clamp-2 leading-snug text-ink-soft" title={s.finding}>
              <span className="font-[family-name:var(--font-num)] text-[12px]">{s.date}</span> {s.study}: {s.finding}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
