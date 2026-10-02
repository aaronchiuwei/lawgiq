"use client";

import { CaretDownIcon, HourglassMediumIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { KIND_ICON, SourceChip, SourceIcon } from "@/components/case/sources";
import type { SourceKind, TaskRelation } from "@/lib/clio/types";
import type { CaseFile } from "@/lib/derive";
import type { BoardColumn, BoardTask, RelatedItem } from "@/lib/derive/task-board";
import { fmtDate, relDays } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Every Clio task on one board: Overdue, Waiting on others, Upcoming, Done.
 * Clicking a card opens everything related to it (calendar entries, notes,
 * emails and calls, other tasks, expenses, document pages), grouped by how it
 * relates. Links come from scripts/link_tasks.py: code proposes, Jev confirms.
 * Read-only: nothing here writes to Clio.
 */

const COLUMNS: { id: BoardColumn; label: string; hint: string }[] = [
  { id: "overdue", label: "Overdue", hint: "Past due and still open" },
  { id: "waiting", label: "Waiting on others", hint: "Someone outside the firm acts next" },
  { id: "upcoming", label: "Upcoming", hint: "On the firm, not yet due" },
  { id: "done", label: "Done", hint: "Completed in Clio" },
];

const RELATIONS: { id: TaskRelation; label: string }[] = [
  { id: "scheduled_as", label: "Scheduled as" },
  { id: "produces", label: "Produces" },
  { id: "verifies", label: "To verify" },
  { id: "follow_up", label: "Follow-ups" },
  { id: "context", label: "Context" },
];

const COUNT_KINDS: SourceKind[] = ["calendar_entry", "communication", "note", "document", "task", "expense"];

const shortParty = (s: string) => s.replace(/,?\s*(P\.C\.|PLLC|LLC|Inc\.?)$/i, "").trim();

export function TaskBoardSection({ c }: { c: CaseFile }) {
  const board = c.taskBoard;
  const [openId, setOpenId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const all = useMemo(() => Object.values(board.columns).flat(), [board]);
  const open = all.find((t) => t.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-3" data-brief="tasks">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = board.columns[col.id];
          const collapsed = col.id === "done" && !showDone;
          return (
            <section key={col.id} aria-labelledby={`tb-${col.id}`} className="flex min-w-0 flex-col rounded-[8px] bg-paper-2/60 p-2">
              <header className="flex items-center gap-2 px-1.5 pb-2 pt-1">
                {col.id === "overdue" ? <WarningCircleIcon size={14} weight="fill" className="text-exposure" aria-hidden /> : null}
                {col.id === "waiting" ? <HourglassMediumIcon size={14} className="text-caution" aria-hidden /> : null}
                <h3 id={`tb-${col.id}`} className="text-[12.5px] font-semibold text-ink">
                  {col.label}
                </h3>
                <span className="tnum rounded-full bg-card-bg px-1.5 text-[11.5px] text-ink-soft">{items.length}</span>
                {col.id === "done" && items.length ? (
                  <button type="button" onClick={() => setShowDone((v) => !v)} className="ml-auto flex items-center gap-1 text-[12px] text-ink-soft hover:text-ink" aria-expanded={!collapsed}>
                    {collapsed ? "Show" : "Hide"}
                    <CaretDownIcon size={11} className={cn("transition-transform", !collapsed && "rotate-180")} aria-hidden />
                  </button>
                ) : null}
              </header>
              {collapsed ? (
                <p className="px-1.5 pb-1 text-[12px] text-ink-soft">{col.hint}.</p>
              ) : items.length ? (
                <ul className="flex flex-col gap-2">
                  {items.map((t) => (
                    <li key={t.id}>
                      <TaskCard t={t} selected={t.id === openId} onOpen={() => setOpenId(t.id === openId ? null : t.id)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-1.5 pb-1 text-[12px] text-ink-soft">Nothing here.</p>
              )}
            </section>
          );
        })}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {open ? <TaskDetail key={open.id} t={open} linked={board.linked} onClose={() => setOpenId(null)} /> : null}
      </AnimatePresence>
    </div>
  );
}

function dueText(t: BoardTask): string {
  if (!t.due) return "No due date";
  if (t.column === "done") return `Due ${fmtDate(t.due, { year: true })}`;
  return `${fmtDate(t.due, { year: false })} · ${relDays(t.daysUntilDue)}`;
}

function TaskCard({ t, selected, onOpen }: { t: BoardTask; selected: boolean; onOpen: () => void }) {
  const counts = COUNT_KINDS.map((k) => [k, t.related.filter((r) => r.source.kind === k).length] as const).filter(([, n]) => n > 0);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={selected}
      className={cn(
        "w-full rounded-[8px] border bg-card-bg px-3 py-2.5 text-left transition-[border-color,box-shadow,transform] duration-150 active:scale-[0.99]",
        selected ? "border-signal shadow-[0_0_0_3px_var(--signal-wash)]" : "border-line hover:border-line-strong",
        t.column === "overdue" && !selected && "border-exposure/35",
      )}
    >
      <p className={cn("line-clamp-3 text-[13.5px] leading-snug", t.column === "done" ? "text-ink-soft" : "text-ink")}>{t.title}</p>
      <p className={cn("tnum mt-1 text-[12px]", t.column === "overdue" ? "text-exposure" : "text-ink-soft")}>{dueText(t)}</p>
      {t.waitingOn ? (
        <p className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-caution-wash px-2 py-0.5 text-[11.5px] text-caution">
          <HourglassMediumIcon size={11} aria-hidden />
          <span className="truncate">Waiting on {shortParty(t.waitingOn.party)}</span>
        </p>
      ) : null}
      {counts.length ? (
        <p className="mt-2 flex flex-wrap items-center gap-2.5 text-[11.5px] text-ink-soft" aria-label={`${t.related.length} related records`}>
          {counts.map(([k, n]) => {
            const I = KIND_ICON[k];
            return (
              <span key={k} className="tnum inline-flex items-center gap-0.5">
                <I size={12} aria-hidden />
                {n}
              </span>
            );
          })}
        </p>
      ) : null}
    </button>
  );
}

function TaskDetail({ t, linked, onClose }: { t: BoardTask; linked: boolean; onClose: () => void }) {
  const groups = RELATIONS.map((r) => ({ ...r, items: t.related.filter((x) => x.relation === r.id) })).filter((g) => g.items.length);
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4, transition: { duration: 0.12 } }}
      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      aria-label={`Related to ${t.title}`}
      className="rounded-[10px] border border-signal/40 bg-card-bg p-4"
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-ink-soft">
            {COLUMNS.find((c) => c.id === t.column)?.label} · <span className="tnum">{dueText(t)}</span>
            {t.importance !== null ? <span className="tnum"> · Jev importance {t.importance.toFixed(2)}</span> : null}
          </p>
          <h3 className="mt-0.5 text-[16px] font-medium leading-snug text-ink">{t.title}</h3>
          {t.waitingOn ? (
            <p className="mt-1 text-[13px] text-caution">
              Waiting on {t.waitingOn.party}
              <span className="text-ink-soft">
                {t.waitingOn.basis === "jev" && t.waitingOn.prob !== null ? ` · Jev ${t.waitingOn.prob.toFixed(2)}` : " · from the task title"}
              </span>
            </p>
          ) : null}
          {t.detail ? <p className="mt-2 max-w-[70ch] whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-soft">{t.detail}</p> : null}
        </div>
        <SourceChip sources={t.source} label="Task in Clio" />
        <button type="button" onClick={onClose} aria-label="Close related records" className="grid size-8 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-paper-2 hover:text-ink">
          <XIcon size={16} />
        </button>
      </header>

      {groups.length ? (
        <div className="mt-4 grid gap-x-6 gap-y-4 border-t border-line pt-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <div key={g.id} className="min-w-0">
              <h4 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                {g.label} <span className="tnum font-normal">({g.items.length})</span>
              </h4>
              <ul className="mt-1.5 flex flex-col">
                {g.items.map((r, i) => (
                  <RelatedRow key={`${r.source.kind}-${r.source.id}-${r.source.page ?? 0}-${i}`} r={r} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 border-t border-line pt-4 text-[13px] text-ink-soft">
          {linked ? "No related records found for this task." : "Related records appear after running python scripts/link_tasks.py."}
        </p>
      )}
      {groups.length ? (
        <p className="mt-4 text-[12px] leading-relaxed text-ink-soft">
          Suggested links: code proposes records that share a contact, distinctive words or a nearby date; Jev keeps those it judges part of this task. Clio itself stores no links between tasks and records.
        </p>
      ) : null}
    </motion.section>
  );
}

function RelatedRow({ r }: { r: RelatedItem }) {
  const name = r.source.label.replace(/^[^·]+·\s*/, "");
  return (
    <li className="grid grid-cols-[1.1rem_minmax(0,1fr)] gap-x-2 border-t border-line py-2 first:border-t-0">
      <SourceIcon source={r.source} size={14} className="mt-0.5 text-ink-soft" />
      <div className="min-w-0">
        <SourceChip sources={r.source} variant="inline" className="line-clamp-2 text-[13px] leading-snug text-ink">
          {name}
        </SourceChip>
        <p className="mt-0.5 text-[11.5px] leading-snug text-ink-soft">
          {r.source.date ? <span className="tnum">{fmtDate(r.source.date, { year: true })} · </span> : null}
          {r.signals.join(" · ") || "related"} · <span className="tnum">Jev {r.prob.toFixed(2)}</span>
        </p>
      </div>
    </li>
  );
}

/** Headline for the board's card header. */
export function taskBoardHeadline(c: CaseFile): string {
  const { overdue, waiting, upcoming } = c.taskBoard.columns;
  const parts: string[] = [];
  if (overdue.length) parts.push(`${overdue.length} overdue`);
  if (waiting.length) parts.push(`${waiting.length} waiting on others`);
  if (upcoming.length) parts.push(`${upcoming.length} upcoming`);
  return parts.length ? `${parts.join(", ")}. Open a task to see everything in Clio that relates to it.` : "No open tasks in Clio.";
}
