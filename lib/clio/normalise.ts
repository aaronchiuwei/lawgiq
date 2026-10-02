import { clioDeepLink, fieldText } from "./links";
import type {
  CalendarEntry,
  ClioDocument,
  Communication,
  Contact,
  CustomFieldValue,
  Expense,
  MatterBundle,
  Note,
  Party,
  Relationship,
  Task,
} from "./types";

/**
 * Normalises the raw Clio Manage API v4 records written by
 * scripts/export_matter.py (data/clio/matter.json) into a MatterBundle.
 * The Python pipeline is the only thing that talks to Clio, and only with GET.
 */

type Json = Record<string, unknown>;

/** Shape of data/clio/matter.json: raw Clio `data` payloads, one key per endpoint. */
export interface ClioExport {
  matter_id: string;
  fetched_at: string;
  matter: Json;
  matter_stages: Json[];
  relationships: Json[];
  notes: Json[];
  communications: Json[];
  tasks: Json[];
  calendar_entries: Json[];
  expenses: Json[];
  documents: Json[];
  contacts: Json[];
}

function party(raw: Json): Party {
  return { kind: raw.type === "User" ? "user" : "contact", id: String(raw.id) };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Clio returns some text with HTML entities (&#39;); the UI wants plain text. */
function text(v: unknown): string {
  return String(v ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
    const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  });
}

function dateOnly(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 10) : "";
}

export function normaliseExport(raw: ClioExport): Omit<MatterBundle, "triage"> {
  const m = raw.matter;
  const id = String(m.id ?? raw.matter_id);
  const link = (kind: Parameters<typeof clioDeepLink>[0], recId: string) => clioDeepLink(kind, recId, id);
  const practiceArea = m.practice_area as Json | null;

  const contacts: Contact[] = (raw.contacts ?? []).map((c) => {
    const avatar = c.avatar as Json | string | undefined;
    return {
      id: String(c.id),
      type: c.type === "Person" ? "Person" : "Company",
      name: String(c.name ?? ""),
      firstName: c.first_name as string | undefined,
      lastName: c.last_name as string | undefined,
      title: c.title as string | undefined,
      company: (c.company as Json | undefined)?.name as string | undefined,
      dateOfBirth: c.date_of_birth as string | undefined,
      emails: ((c.email_addresses as Json[]) ?? []).map((e) => ({ name: String(e.name), address: String(e.address) })),
      phones: ((c.phone_numbers as Json[]) ?? []).map((p) => ({ name: String(p.name), number: String(p.number) })),
      addresses: ((c.addresses as Json[]) ?? []).map((a) => ({
        name: String(a.name),
        street: String(a.street),
        city: String(a.city),
        province: String(a.province),
        postalCode: String(a.postal_code),
      })),
      avatarUrl: typeof avatar === "string" ? avatar : ((avatar?.url as string | undefined) ?? null),
    };
  });

  const customFields: CustomFieldValue[] = ((m.custom_field_values as Json[]) ?? []).map((cf) => {
    const def = cf.custom_field as Json;
    const name = String(cf.field_name ?? def?.name ?? "");
    const value = (typeof cf.value === "string" ? text(cf.value) : cf.value) as CustomFieldValue["value"];
    return {
      fieldId: String(def?.id ?? cf.id),
      name,
      fieldType: String(cf.field_type ?? ""),
      value,
      source: {
        kind: "custom_field",
        id: String(cf.id),
        label: `Custom field · ${name}`,
        snippet: fieldText(String(cf.field_type ?? ""), value),
        body: typeof value === "string" ? value : undefined,
        clioUrl: link("custom_field", String(cf.id)),
      },
    };
  });

  const sol = m.statute_of_limitations as Json | null;
  const stage = m.matter_stage as Json | null;
  const stagesInOrder = [...(raw.matter_stages ?? [])]
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
    .map((s) => String(s.name));

  return {
    matter: {
      id,
      description: text(m.description),
      status: String(m.status ?? ""),
      openDate: String(m.open_date ?? ""),
      statuteOfLimitations: sol ? dateOnly(sol.due_at) : null,
      stage: stage ? String(stage.name) : null,
      stagesInOrder,
      practiceArea: practiceArea ? String(practiceArea.name) : null,
      clientId: String((m.client as Json).id),
      clioUrl: link("matter", id),
    },
    customFields,
    contacts,
    relationships: (raw.relationships ?? []).map<Relationship>((r) => ({
      id: String(r.id),
      contactId: String((r.contact as Json).id),
      description: text(r.description),
    })),
    notes: (raw.notes ?? []).map<Note>((n) => ({
      id: String(n.id),
      date: dateOnly(n.date),
      subject: text(n.subject),
      detail: text(n.detail),
      createdAt: n.created_at as string | undefined,
    })),
    communications: (raw.communications ?? []).map<Communication>((c) => ({
      id: String(c.id),
      type: String(c.type).startsWith("Phone") ? "phone" : "email",
      date: dateOnly(c.date ?? c.received_at),
      subject: text(c.subject),
      body: text(c.body),
      senders: ((c.senders as Json[]) ?? []).map(party),
      receivers: ((c.receivers as Json[]) ?? []).map(party),
      createdAt: c.created_at as string | undefined,
    })),
    tasks: (raw.tasks ?? []).map<Task>((t) => ({
      id: String(t.id),
      name: text(t.name),
      description: text(t.description),
      dueAt: t.due_at ? dateOnly(t.due_at) : null,
      status: String(t.status ?? "pending"),
      isStatuteOfLimitations: Boolean(t.statute_of_limitations),
      createdAt: t.created_at as string | undefined,
    })),
    calendarEntries: (raw.calendar_entries ?? []).map<CalendarEntry>((c) => ({
      id: String(c.id),
      summary: text(c.summary),
      description: text(c.description),
      startAt: String(c.start_at),
      endAt: String(c.end_at),
      createdAt: c.created_at as string | undefined,
    })),
    expenses: (raw.expenses ?? []).map<Expense>((e) => ({
      id: String(e.id),
      date: dateOnly(e.date),
      quantity: Number(e.quantity ?? 1),
      price: Number(e.price ?? 0),
      total: Number(e.total ?? Number(e.quantity ?? 1) * Number(e.price ?? 0)),
      note: text(e.note),
    })),
    documents: (raw.documents ?? []).map<ClioDocument>((d) => ({
      id: String(d.id),
      name: String(d.name ?? ""),
      folder: String((d.parent as Json | undefined)?.name ?? ""),
      receivedAt: String(d.received_at ?? d.created_at ?? ""),
      bytes: typeof d.size === "number" ? d.size : undefined,
    })),
    origin: "clio",
    fetchedAt: raw.fetched_at,
  };
}
