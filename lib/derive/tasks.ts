import type { MatterBundle, SourceRef, Task } from "../clio/types";
import type { Provider } from "./providers";
import { providersMentioned } from "./providers";
import { daysBetween, isoDay, type SourceFn } from "./util";

/**
 * Open tasks in three buckets. A task titled "By <party>: ..." is waiting on
 * someone outside the firm (the convention this firm uses in Clio).
 */

export interface TaskItem {
  id: string;
  title: string;
  detail: string;
  due: string | null;
  /** Negative = overdue by that many days. */
  daysUntilDue: number | null;
  source: SourceRef;
  /** For waiting tasks: who we're waiting on. */
  waitingOn: string | null;
  waitingOnKind: string | null;
  providerIds: string[];
}

export interface TaskBuckets {
  overdue: TaskItem[];
  comingUp: TaskItem[];
  waiting: TaskItem[];
  completedCount: number;
}

const WAITING = /^By\s+(.+?):\s*(.+?)\s+-\s+(.+)$/i;
const WAITING_LOOSE = /^By\s+(.+?):\s*(.+)$/i;

export function parseWaiting(name: string): { kind: string; party: string; request: string } | null {
  const m = name.match(WAITING);
  if (m) return { kind: m[1].trim(), party: m[2].trim(), request: m[3].trim() };
  const l = name.match(WAITING_LOOSE);
  return l ? { kind: l[1].trim(), party: l[2].trim(), request: l[2].trim() } : null;
}

export function toTaskItem(t: Task, today: string, providers: Provider[], source: SourceFn): TaskItem {
  const waiting = parseWaiting(t.name);
  return {
    id: t.id,
    title: waiting ? waiting.request : t.name,
    detail: t.description,
    due: t.dueAt ? isoDay(t.dueAt) : null,
    daysUntilDue: t.dueAt ? daysBetween(today, t.dueAt) : null,
    source: source("task", t.id, `Task · ${t.name}`, { date: t.dueAt ?? undefined, text: t.description }),
    waitingOn: waiting?.party ?? null,
    waitingOnKind: waiting?.kind ?? null,
    providerIds: providersMentioned(`${t.name} ${t.description}`, providers),
  };
}

export function bucketTasks(bundle: MatterBundle, today: string, providers: Provider[], source: SourceFn): TaskBuckets {
  const open = bundle.tasks.filter((t) => t.status !== "complete" && !t.isStatuteOfLimitations);
  const items = open.map((t) => toTaskItem(t, today, providers, source));
  const byDue = (a: TaskItem, b: TaskItem) => (a.due ?? "9999").localeCompare(b.due ?? "9999");
  return {
    waiting: items.filter((i) => i.waitingOn).sort(byDue),
    overdue: items.filter((i) => !i.waitingOn && i.daysUntilDue !== null && i.daysUntilDue < 0).sort(byDue),
    comingUp: items.filter((i) => !i.waitingOn && (i.daysUntilDue === null || i.daysUntilDue >= 0)).sort(byDue),
    completedCount: bundle.tasks.filter((t) => t.status === "complete").length,
  };
}
