import { readFile } from "node:fs/promises";
import path from "node:path";
import { fieldText } from "./links";
import type {
  CalendarEntry,
  ClioDocument,
  Communication,
  Contact,
  CustomFieldValue,
  Expense,
  MatterBundle,
  MatterSource,
  Note,
  Party,
  Relationship,
  Task,
} from "./types";

/**
 * Fixture adapter: reads the hackathon's Clio request-body export
 * (sapini-clio-data.json) and normalises it into the same MatterBundle the
 * live client produces. Placeholders like {{contact:client}} become stable
 * synthetic ids. No Clio record exists, so every clioUrl is null.
 */

type Json = Record<string, unknown>;

const DEFAULT_PATH = path.join(process.cwd(), "fixtures", "sapini-clio-data.json");

function placeholder(value: unknown): { kind: string; name: string } | null {
  if (typeof value !== "string") return null;
  const m = value.match(/^\{\{(\w+)(?::(.+))?\}\}$/);
  return m ? { kind: m[1], name: m[2] ?? "" } : null;
}

function refId(value: unknown): string {
  const p = placeholder(value);
  if (!p) return String(value);
  if (p.kind === "contact") return `contact-${p.name}`;
  if (p.kind === "user_id") return "user-self";
  if (p.kind === "matter_id") return "matter-fixture";
  return `${p.kind}-${p.name}`;
}

function party(raw: Json): Party {
  const id = refId(raw.id);
  return { kind: raw.type === "User" ? "user" : "contact", id };
}

function items(section: unknown): Json[] {
  const s = section as { items?: Json[] } | undefined;
  return (s?.items ?? []).map((i) => (i.body ?? i) as Json);
}

export class FixtureMatterSource implements MatterSource {
  readonly origin = "fixture" as const;
  constructor(private readonly filePath: string = process.env.FIXTURE_PATH ?? DEFAULT_PATH) {}

  async loadMatter(): Promise<MatterBundle> {
    const raw = JSON.parse(await readFile(this.filePath, "utf8")) as Json;
    const stagesSection = raw.matter_stages as { stages_in_order?: string[] } | undefined;
    const matterBody = (raw.matter as { body: Json }).body;

    // Custom fields: definitions give ids and types; the matter body carries values.
    const fieldDefs = new Map<string, { id: string; type: string }>();
    items(raw.custom_fields).forEach((f, i) => {
      fieldDefs.set(String(f.name), { id: `field-${i + 1}`, type: String(f.field_type) });
    });

    const customFields: CustomFieldValue[] = ((matterBody.custom_field_values as Json[]) ?? []).map((cf) => {
      const name = placeholder((cf.custom_field as Json).id)?.name ?? "Unknown field";
      const def = fieldDefs.get(name);
      const value = cf.value as CustomFieldValue["value"];
      return {
        fieldId: def?.id ?? name,
        name,
        fieldType: def?.type ?? "text_line",
        value,
        source: {
          kind: "custom_field",
          id: def?.id ?? name,
          label: `Custom field · ${name}`,
          snippet: fieldText(def?.type ?? "", value),
          body: typeof value === "string" ? value : undefined,
          clioUrl: null,
        },
      };
    });

    const contacts: Contact[] = ((raw.contacts as { items: Json[] }).items ?? []).map((item) => {
      const b = item.body as Json;
      const isPerson = b.type === "Person";
      const name = isPerson
        ? [b.first_name, b.last_name].filter(Boolean).join(" ")
        : String(b.name ?? "");
      return {
        id: `contact-${item.ref}`,
        type: isPerson ? "Person" : "Company",
        name,
        firstName: b.first_name as string | undefined,
        lastName: b.last_name as string | undefined,
        title: b.title as string | undefined,
        company: b.company as string | undefined,
        dateOfBirth: b.date_of_birth as string | undefined,
        emails: ((b.email_addresses as Json[]) ?? []).map((e) => ({ name: String(e.name), address: String(e.address) })),
        phones: ((b.phone_numbers as Json[]) ?? []).map((p) => ({ name: String(p.name), number: String(p.number) })),
        addresses: ((b.addresses as Json[]) ?? []).map((a) => ({
          name: String(a.name),
          street: String(a.street),
          city: String(a.city),
          province: String(a.province),
          postalCode: String(a.postal_code),
        })),
        avatarUrl: null,
      };
    });

    const relationships: Relationship[] = items(raw.relationships).map((r, i) => ({
      id: `relationship-${i + 1}`,
      contactId: refId((r.contact as Json).id),
      description: String(r.description ?? ""),
    }));

    const notes: Note[] = items(raw.notes).map((n, i) => ({
      id: `note-${i + 1}`,
      date: String(n.date),
      subject: String(n.subject ?? ""),
      detail: String(n.detail ?? ""),
    }));

    const communications: Communication[] = items(raw.communications).map((c, i) => ({
      id: `communication-${i + 1}`,
      type: c.type === "PhoneCommunication" ? "phone" : "email",
      date: String(c.date),
      subject: String(c.subject ?? ""),
      body: String(c.body ?? ""),
      senders: ((c.senders as Json[]) ?? []).map(party),
      receivers: ((c.receivers as Json[]) ?? []).map(party),
    }));

    const tasks: Task[] = items(raw.tasks).map((t, i) => ({
      id: `task-${i + 1}`,
      name: String(t.name ?? ""),
      description: String(t.description ?? ""),
      dueAt: (t.due_at as string) ?? null,
      status: String(t.status ?? "pending"),
      isStatuteOfLimitations: Boolean(t.statute_of_limitations),
    }));

    const calendarEntries: CalendarEntry[] = items(raw.calendar_entries).map((c, i) => ({
      id: `calendar-${i + 1}`,
      summary: String(c.summary ?? ""),
      description: String(c.description ?? ""),
      startAt: String(c.start_at),
      endAt: String(c.end_at),
    }));

    const expenses: Expense[] = items(raw.expenses).map((e, i) => {
      const quantity = Number(e.quantity ?? 1);
      const price = Number(e.price ?? 0);
      return { id: `expense-${i + 1}`, date: String(e.date), quantity, price, total: quantity * price, note: String(e.note ?? "") };
    });

    const documents: ClioDocument[] = ((raw.documents as { items: Json[] }).items ?? []).map((d, i) => {
      const b = d.body as Json;
      return {
        id: `document-${i + 1}`,
        name: String(b.name),
        folder: placeholder((b.parent as Json).id)?.name ?? "",
        receivedAt: String(b.received_at),
        bytes: d.bytes as number | undefined,
      };
    });

    const stagePlaceholder = placeholder((matterBody.matter_stage as Json | undefined)?.id);
    const sol = matterBody.statute_of_limitations;

    return {
      matter: {
        id: "matter-fixture",
        description: String(matterBody.description ?? ""),
        status: String(matterBody.status ?? ""),
        openDate: String(matterBody.open_date ?? ""),
        statuteOfLimitations: typeof sol === "string" ? sol : null,
        stage: stagePlaceholder?.name ?? null,
        stagesInOrder: stagesSection?.stages_in_order ?? [],
        practiceArea: "Personal Injury",
        clientId: refId((matterBody.client as Json).id),
        clioUrl: null,
      },
      customFields,
      contacts,
      relationships,
      notes,
      communications,
      tasks,
      calendarEntries,
      expenses,
      documents,
      origin: "fixture",
      fetchedAt: new Date().toISOString(),
    };
  }
}
