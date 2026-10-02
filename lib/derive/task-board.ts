import type { MatterBundle, SourceRef, TaskLink, TaskRelation } from "../clio/types";
import { parseWaiting } from "./tasks";
import { daysBetween, isoDay, type SourceFn } from "./util";

/**
 * The firm's task board: every Clio task in one of four columns, each with the
 * records related to it (scripts/link_tasks.py). Separate from TaskBuckets
 * (lib/derive/tasks.ts), which other views depend on.
 *
 * Column rules, in order: complete -> done; past due -> overdue (an overdue
 * task stays overdue even when it waits on someone, with a badge saying who);
 * waiting on someone outside the firm -> waiting; otherwise -> upcoming.
 */

export type BoardColumn = "overdue" | "waiting" | "upcoming" | "done";

/** Jev must be at least this sure a task waits on someone outside the firm. */
export const WAITING_MIN = 0.6;

export interface RelatedItem {
  relation: TaskRelation;
  /** Jev's probability that the record belongs to the task. */
  prob: number;
  /** Why code proposed the link. */
  signals: string[];
  source: SourceRef;
}

export interface BoardTask {
  id: string;
  title: string;
  detail: string;
  status: string;
  due: string | null;
  /** Negative = overdue by that many days. */
  daysUntilDue: number | null;
  column: BoardColumn;
  waitingOn: { party: string; prob: number | null; basis: "jev" | "title" } | null;
  /** Jev importance from scripts/triage.py, 0-1. */
  importance: number | null;
  isStatuteOfLimitations: boolean;
  source: SourceRef;
  related: RelatedItem[];
}

export interface TaskBoard {
  columns: Record<BoardColumn, BoardTask[]>;
  /** True when scripts/link_tasks.py output was found. */
  linked: boolean;
}

const COMM_LABEL = (type: string) => (type === "phone" ? "Call" : "Email");

/** Turns one link into a SourceRef for the drawer, or null if the record is gone from the bundle. */
function relatedSource(bundle: MatterBundle, link: TaskLink, source: SourceFn): SourceRef | null {
  switch (link.kind) {
    case "note": {
      const n = bundle.notes.find((x) => x.id === link.id);
      return n ? source("note", n.id, `Note · ${n.subject}`, { date: n.date, text: n.detail }) : null;
    }
    case "communication": {
      const m = bundle.communications.find((x) => x.id === link.id);
      return m ? source("communication", m.id, `${COMM_LABEL(m.type)} · ${m.subject}`, { date: m.date, text: m.body }) : null;
    }
    case "calendar_entry": {
      const e = bundle.calendarEntries.find((x) => x.id === link.id);
      return e ? source("calendar_entry", e.id, `Calendar · ${e.summary}`, { date: e.startAt, text: e.description }) : null;
    }
    case "task": {
      const t = bundle.tasks.find((x) => x.id === link.id);
      return t ? source("task", t.id, `Task · ${t.name}`, { date: t.dueAt ?? undefined, text: t.description }) : null;
    }
    case "expense": {
      const x = bundle.expenses.find((e) => e.id === link.id);
      return x ? source("expense", x.id, `Expense · ${x.note.split("\n")[0]}`, { date: x.date, text: x.note }) : null;
    }
    case "document": {
      const d = bundle.documents.find((x) => x.id === link.id);
      if (!d) return null;
      const label = `Document · ${d.name}${link.page ? ` · p.${link.page}` : ""}`;
      return source("document", d.id, label, { date: d.receivedAt, page: link.page });
    }
    default:
      return null;
  }
}

export function deriveTaskBoard(bundle: MatterBundle, today: string, source: SourceFn): TaskBoard {
  const columns: Record<BoardColumn, BoardTask[]> = { overdue: [], waiting: [], upcoming: [], done: [] };
  const linksById = bundle.taskLinks ?? {};

  for (const t of bundle.tasks) {
    const links = linksById[t.id];
    const byTitle = parseWaiting(t.name);
    const jevWaits = links && links.waiting.prob >= WAITING_MIN && links.waiting.party;
    const waitingOn = jevWaits
      ? { party: links.waiting.party as string, prob: links.waiting.prob, basis: "jev" as const }
      : byTitle
        ? { party: byTitle.party, prob: null, basis: "title" as const }
        : null;
    const daysUntilDue = t.dueAt ? daysBetween(today, t.dueAt) : null;
    const done = t.status === "complete";
    const column: BoardColumn = done
      ? "done"
      : daysUntilDue !== null && daysUntilDue < 0
        ? "overdue"
        : waitingOn
          ? "waiting"
          : "upcoming";

    const related = (links?.links ?? [])
      .map((l) => {
        const s = relatedSource(bundle, l, source);
        return s ? { relation: l.relation, prob: l.relatedProb, signals: l.signals, source: s } : null;
      })
      .filter((r): r is RelatedItem => r !== null);

    columns[column].push({
      id: t.id,
      title: byTitle ? byTitle.request : t.name,
      detail: t.description,
      status: t.status,
      due: t.dueAt ? isoDay(t.dueAt) : null,
      daysUntilDue,
      column,
      waitingOn: done ? null : waitingOn,
      importance: bundle.triage[`task:${t.id}`]?.importance ?? null,
      isStatuteOfLimitations: t.isStatuteOfLimitations,
      source: source("task", t.id, `Task · ${t.name}`, { date: t.dueAt ?? undefined, text: t.description }),
      related,
    });
  }

  const byDue = (a: BoardTask, b: BoardTask) => (a.due ?? "9999").localeCompare(b.due ?? "9999");
  columns.overdue.sort(byDue);
  columns.waiting.sort(byDue);
  columns.upcoming.sort(byDue);
  columns.done.sort((a, b) => (b.due ?? "").localeCompare(a.due ?? ""));
  return { columns, linked: Object.keys(linksById).length > 0 };
}
