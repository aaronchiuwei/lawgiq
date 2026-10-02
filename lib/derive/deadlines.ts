import type { MatterBundle, SourceRef } from "../clio/types";
import { daysBetween, isoDay, type SourceFn } from "./util";

/**
 * Key deadlines. The statute of limitations is always first. A limitations
 * date in the past whose Clio task is complete is SATISFIED (suit was filed in
 * time), not expired; only an incomplete one is an alarm.
 */

export type SolStatus = "satisfied" | "expired" | "upcoming" | "unknown";

export interface SolDeadline {
  date: string | null;
  status: SolStatus;
  daysUntil: number | null;
  explanation: string;
  sources: SourceRef[];
}

export type DeadlineKind = "court" | "decision" | "appointment" | "call" | "treatment";

export interface Deadline {
  id: string;
  date: string;
  title: string;
  detail: string;
  kind: DeadlineKind;
  daysUntil: number;
  source: SourceRef;
}

export function classifyCalendar(summary: string): DeadlineKind {
  if (/conference|hearing|trial|motion|deposition|court|deadline|limitations/i.test(summary)) return "court";
  if (/review|decision/i.test(summary)) return "decision";
  if (/treatment:|therapy|chiropractic/i.test(summary)) return "treatment";
  if (/\bcall\b/i.test(summary)) return "call";
  return "appointment";
}

export function deriveSol(bundle: MatterBundle, today: string, source: SourceFn): SolDeadline {
  const task = bundle.tasks.find((t) => t.isStatuteOfLimitations);
  const cal = bundle.calendarEntries.find((c) => /limitations/i.test(c.summary));
  const date = bundle.matter.statuteOfLimitations ?? task?.dueAt ?? (cal ? isoDay(cal.startAt) : null);
  const sources: SourceRef[] = [];
  if (task) sources.push(source("task", task.id, `Task · ${task.name}`, { date: task.dueAt ?? undefined, text: task.description }));
  if (bundle.matter.statuteOfLimitations)
    sources.push(source("matter", bundle.matter.id, "Matter · Statute of limitations", { date: bundle.matter.statuteOfLimitations }));
  if (cal) sources.push(source("calendar_entry", cal.id, `Calendar · ${cal.summary}`, { date: cal.startAt, text: cal.description }));

  if (!date) return { date: null, status: "unknown", daysUntil: null, explanation: "No limitations date on the matter.", sources };
  const daysUntil = daysBetween(today, date);
  if (task?.status === "complete") {
    return {
      date: isoDay(date),
      status: "satisfied",
      daysUntil,
      explanation: task.description || "Limitations task marked complete in Clio.",
      sources,
    };
  }
  if (daysUntil < 0) {
    return { date: isoDay(date), status: "expired", daysUntil, explanation: "Date has passed and the limitations task is not complete.", sources };
  }
  return { date: isoDay(date), status: "upcoming", daysUntil, explanation: task?.description ?? "", sources };
}

export function deriveDeadlines(bundle: MatterBundle, today: string, source: SourceFn): Deadline[] {
  return bundle.calendarEntries
    .filter((c) => isoDay(c.startAt) >= today && !/limitations/i.test(c.summary))
    .map((c) => ({
      id: c.id,
      date: isoDay(c.startAt),
      title: c.summary,
      detail: c.description,
      kind: classifyCalendar(c.summary),
      daysUntil: daysBetween(today, c.startAt),
      source: source("calendar_entry", c.id, `Calendar · ${c.summary}`, { date: c.startAt, text: c.description }),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface ClientContact {
  last: { date: string; daysAgo: number; channel: "email" | "phone"; direction: "inbound" | "outbound"; subject: string; source: SourceRef } | null;
  stale: boolean;
  thresholdDays: number;
  nextScheduled: { date: string; title: string; source: SourceRef } | null;
}

export function deriveClientContact(bundle: MatterBundle, today: string, thresholdDays: number, source: SourceFn): ClientContact {
  const clientId = bundle.matter.clientId;
  const touches = bundle.communications
    .filter((c) => isoDay(c.date) <= today && [...c.senders, ...c.receivers].some((p) => p.kind === "contact" && p.id === clientId))
    .sort((a, b) => b.date.localeCompare(a.date));
  const c = touches[0];
  const last = c
    ? {
        date: isoDay(c.date),
        daysAgo: daysBetween(c.date, today),
        channel: c.type,
        direction: c.senders.some((p) => p.id === clientId) ? ("inbound" as const) : ("outbound" as const),
        subject: c.subject,
        source: source("communication", c.id, `${c.type === "phone" ? "Call" : "Email"} · ${c.subject}`, { date: c.date, text: c.body }),
      }
    : null;
  const next = bundle.calendarEntries
    .filter((e) => isoDay(e.startAt) >= today && /client/i.test(e.summary) && !/treatment:/i.test(e.summary))
    .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  return {
    last,
    stale: !last || last.daysAgo > thresholdDays,
    thresholdDays,
    nextScheduled: next
      ? { date: isoDay(next.startAt), title: next.summary, source: source("calendar_entry", next.id, `Calendar · ${next.summary}`, { date: next.startAt, text: next.description }) }
      : null,
  };
}
