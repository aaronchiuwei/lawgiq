import type { MatterBundle, SourceRef, TriageScore } from "../clio/types";
import { providersMentioned, type Provider } from "./providers";
import { isoDay, jaccard, tokens, type SourceFn } from "./util";

/**
 * Every dated record on the matter, merged into one chronology:
 * notes + communications + calendar entries + tasks + documents + expenses.
 */

export type EventKind = "note" | "email" | "call" | "calendar" | "task" | "document" | "expense";

export interface CaseEvent {
  id: string;
  date: string;
  kind: EventKind;
  title: string;
  text: string;
  source: SourceRef;
  providerIds: string[];
  involvesClient: boolean;
  /** Contact ids that sent or received this (communications only). */
  partyIds: string[];
  /** Sent by the firm (communications only). */
  outbound: boolean;
  /** Clio created_at when live; used for "what changed since you last opened it". */
  createdAt?: string;
  /** Other records saying the same thing (exact duplicates collapsed into this one). */
  duplicates: SourceRef[];
  /** Jev triage for this record (scripts/triage.py), when it has been scored. */
  jev: TriageScore | null;
}

function humaniseDocName(name: string): string {
  const base = name.replace(/\.[a-z]+$/i, "").split("__").pop() ?? name;
  const words = base.replace(/-/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function buildEvents(bundle: MatterBundle, providers: Provider[], source: SourceFn): CaseEvent[] {
  const clientId = bundle.matter.clientId;
  const events: CaseEvent[] = [];
  const push = (
    e: Omit<CaseEvent, "providerIds" | "duplicates" | "partyIds" | "outbound" | "jev"> & { providerIds?: string[]; partyIds?: string[]; outbound?: boolean },
  ) =>
    events.push({
      ...e,
      jev: bundle.triage?.[`${e.source.kind}:${e.id}`] ?? null,
      outbound: e.outbound ?? false,
      providerIds: e.providerIds ?? providersMentioned(`${e.title} ${e.text}`, providers),
      partyIds: e.partyIds ?? [],
      duplicates: [],
    });

  for (const n of bundle.notes) {
    push({
      id: n.id,
      date: isoDay(n.date),
      kind: "note",
      title: n.subject,
      text: n.detail,
      source: source("note", n.id, `Note · ${n.subject}`, { date: n.date, text: n.detail }),
      involvesClient: /\bclient\b|justin|\bhe\b/i.test(n.detail),
      createdAt: n.createdAt,
    });
  }

  for (const c of bundle.communications) {
    const parties = [...c.senders, ...c.receivers];
    const contactParty = parties.filter((p) => p.kind === "contact").map((p) => p.id);
    push({
      id: c.id,
      date: isoDay(c.date),
      kind: c.type === "phone" ? "call" : "email",
      title: c.subject,
      text: c.body,
      source: source("communication", c.id, `${c.type === "phone" ? "Call" : "Email"} · ${c.subject}`, {
        date: c.date,
        text: c.body,
      }),
      providerIds: [
        ...new Set([
          ...contactParty.filter((id) => providers.some((p) => p.id === id)),
          ...providersMentioned(`${c.subject} ${c.body}`, providers),
        ]),
      ],
      involvesClient: contactParty.includes(clientId),
      partyIds: contactParty,
      outbound: c.senders.some((p) => p.kind === "user"),
      createdAt: c.createdAt,
    });
  }

  for (const e of bundle.calendarEntries) {
    push({
      id: e.id,
      date: isoDay(e.startAt),
      kind: "calendar",
      title: e.summary,
      text: e.description,
      source: source("calendar_entry", e.id, `Calendar · ${e.summary}`, { date: e.startAt, text: e.description }),
      involvesClient: /client/i.test(e.summary),
      createdAt: e.createdAt,
    });
  }

  for (const t of bundle.tasks) {
    if (!t.dueAt) continue;
    push({
      id: t.id,
      date: isoDay(t.dueAt),
      kind: "task",
      title: t.name,
      text: t.description,
      source: source("task", t.id, `Task · ${t.name}`, { date: t.dueAt, text: t.description }),
      involvesClient: /from client|client/i.test(t.name),
      createdAt: t.createdAt,
    });
  }

  for (const d of bundle.documents) {
    const title = humaniseDocName(d.name);
    push({
      id: d.id,
      date: isoDay(d.receivedAt),
      kind: "document",
      title,
      text: `${title}, filed in ${d.folder.replace(/^\d+\s*/, "")}.`,
      source: source("document", d.id, `Document · ${title}`, {
        date: d.receivedAt,
        text: [
          `${title}, received ${isoDay(d.receivedAt)} into the ${d.folder.replace(/^\d+\s*/, "")} folder${d.pageCount ? ` (${d.pageCount} page${d.pageCount === 1 ? "" : "s"})` : ""}.`,
          d.ocrExcerpt,
        ]
          .filter(Boolean)
          .join("\n\n"),
      }),
      providerIds: [],
      involvesClient: false,
    });
  }

  for (const x of bundle.expenses) {
    const first = x.note.split("\n")[0];
    push({
      id: x.id,
      date: isoDay(x.date),
      kind: "expense",
      title: first.split(":")[0],
      text: x.note,
      source: source("expense", x.id, `Expense · ${first.split(":")[0]}`, { date: x.date, text: x.note }),
      providerIds: [],
      involvesClient: false,
    });
  }

  return collapseDuplicates(events).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** Two communications with identical bodies are one fact, not two events. */
function collapseDuplicates(events: CaseEvent[]): CaseEvent[] {
  const out: CaseEvent[] = [];
  for (const e of events) {
    const twin = out.find(
      (o) =>
        o.kind === e.kind &&
        o.text.length > 40 &&
        Math.abs(Date.parse(o.date) - Date.parse(e.date)) <= 3 * 86_400_000 &&
        jaccard(tokens(o.text), tokens(e.text)) > 0.9,
    );
    if (twin) twin.duplicates.push(e.source);
    else out.push(e);
  }
  return out;
}
