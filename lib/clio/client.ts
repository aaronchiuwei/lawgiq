import { clioDeepLink, fieldText } from "./links";
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
 * Read-only Clio Manage API v4 client.
 *
 * The only network verb this module can issue is GET: `request()` hard-codes
 * the method and refuses anything else, so a future edit can't quietly add a
 * write against case data. Everything we persist lives in our own database.
 */

type Json = Record<string, unknown>;

const API_BASE = process.env.CLIO_API_BASE ?? "https://app.clio.com/api/v4";

export class ClioReadOnlyError extends Error {}

export class ClioClient {
  constructor(
    private readonly token: string,
    private readonly base: string = API_BASE,
  ) {}

  /** GET a path with query params. Retries once on 429 using Retry-After. */
  async get<T = Json>(pathname: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(`${this.base}${pathname}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    return this.request<T>(url.toString(), "GET");
  }

  /** Follows meta.paging.next until exhausted. */
  async getAll<T = Json>(pathname: string, params: Record<string, string | number | undefined> = {}): Promise<T[]> {
    const out: T[] = [];
    let page = await this.get<{ data: T[]; meta?: { paging?: { next?: string } } }>(pathname, { limit: 200, ...params });
    out.push(...page.data);
    while (page.meta?.paging?.next) {
      page = await this.request(page.meta.paging.next, "GET");
      out.push(...page.data);
    }
    return out;
  }

  private async request<T>(url: string, method: "GET", attempt = 0): Promise<T> {
    if (method !== "GET") throw new ClioReadOnlyError(`Refusing ${method}: this integration is read-only.`);
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 429 && attempt < 2) {
      const wait = Number(res.headers.get("Retry-After") ?? "2") * 1000;
      await new Promise((r) => setTimeout(r, wait));
      return this.request<T>(url, method, attempt + 1);
    }
    if (!res.ok) throw new Error(`Clio ${res.status} on GET ${new URL(url).pathname}`);
    return (await res.json()) as T;
  }
}

function party(raw: Json): Party {
  return { kind: raw.type === "User" ? "user" : "contact", id: String(raw.id) };
}

function dateOnly(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 10) : "";
}

export class LiveClioMatterSource implements MatterSource {
  readonly origin = "clio" as const;
  private readonly client: ClioClient;

  constructor(
    token: string,
    private readonly matterId: string | undefined = process.env.CLIO_MATTER_ID,
    private readonly matterQuery: string | undefined = process.env.CLIO_MATTER_QUERY,
  ) {
    this.client = new ClioClient(token);
  }

  private async resolveMatterId(): Promise<string> {
    if (this.matterId) return this.matterId;
    if (!this.matterQuery) throw new Error("Set CLIO_MATTER_ID or CLIO_MATTER_QUERY to pick the matter.");
    const found = await this.client.get<{ data: Json[] }>("/matters.json", { query: this.matterQuery, fields: "id", limit: 1 });
    if (!found.data[0]) throw new Error(`No Clio matter matches "${this.matterQuery}".`);
    return String(found.data[0].id);
  }

  async loadMatter(): Promise<MatterBundle> {
    const id = await this.resolveMatterId();
    const link = (kind: Parameters<typeof clioDeepLink>[0], recId: string) => clioDeepLink(kind, recId, id);

    const { data: m } = await this.client.get<{ data: Json }>(`/matters/${id}.json`, {
      fields:
        "id,description,status,open_date,statute_of_limitations{id,due_at,status},matter_stage{id,name},practice_area{id,name},client{id},custom_field_values{id,field_name,field_type,value,custom_field{id,name}}",
    });
    const practiceArea = m.practice_area as Json | null;

    const [stages, rels, notes, comms, tasks, cal, expenses, docs] = await Promise.all([
      practiceArea
        ? this.client.getAll<Json>("/matter_stages.json", { practice_area_id: String(practiceArea.id), fields: "id,name,order" })
        : Promise.resolve([] as Json[]),
      this.client.getAll<Json>("/relationships.json", { matter_id: id, fields: "id,description,contact{id}" }),
      this.client.getAll<Json>("/notes.json", { matter_id: id, type: "Matter", fields: "id,subject,detail,date,created_at" }),
      this.client.getAll<Json>("/communications.json", {
        matter_id: id,
        fields: "id,type,subject,body,date,created_at,senders{id,type},receivers{id,type}",
      }),
      this.client.getAll<Json>("/tasks.json", {
        matter_id: id,
        fields: "id,name,description,due_at,status,statute_of_limitations,created_at",
      }),
      this.client.getAll<Json>("/calendar_entries.json", {
        matter_id: id,
        fields: "id,summary,description,start_at,end_at,created_at",
      }),
      this.client.getAll<Json>("/activities.json", { matter_id: id, type: "ExpenseEntry", fields: "id,date,quantity,price,total,note" }),
      this.client.getAll<Json>("/documents.json", { matter_id: id, fields: "id,name,received_at,parent{id,name}" }),
    ]);

    const clientId = String((m.client as Json).id);
    const contactIds = new Set<string>([clientId, ...rels.map((r) => String((r.contact as Json).id))]);
    for (const c of comms) for (const p of [...((c.senders as Json[]) ?? []), ...((c.receivers as Json[]) ?? [])]) {
      if (p.type === "Contact") contactIds.add(String(p.id));
    }
    const extraFields = process.env.CLIO_CONTACT_EXTRA_FIELDS ? `,${process.env.CLIO_CONTACT_EXTRA_FIELDS}` : "";
    const contactRows = await Promise.all(
      [...contactIds].map((cid) =>
        this.client
          .get<{ data: Json }>(`/contacts/${cid}.json`, {
            fields: `id,name,first_name,last_name,type,title,company{name},date_of_birth,email_addresses{name,address},phone_numbers{name,number},addresses{name,street,city,province,postal_code}${extraFields}`,
          })
          .then((r) => r.data),
      ),
    );

    const contacts: Contact[] = contactRows.map((c) => {
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
      const value = cf.value as CustomFieldValue["value"];
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
    const stagesInOrder = [...stages]
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
      .map((s) => String(s.name));

    return {
      matter: {
        id,
        description: String(m.description ?? ""),
        status: String(m.status ?? ""),
        openDate: String(m.open_date ?? ""),
        statuteOfLimitations: sol ? dateOnly(sol.due_at) : null,
        stage: stage ? String(stage.name) : null,
        stagesInOrder,
        practiceArea: practiceArea ? String(practiceArea.name) : null,
        clientId,
        clioUrl: link("matter", id),
      },
      customFields,
      contacts,
      relationships: rels.map<Relationship>((r) => ({
        id: String(r.id),
        contactId: String((r.contact as Json).id),
        description: String(r.description ?? ""),
      })),
      notes: notes.map<Note>((n) => ({
        id: String(n.id),
        date: dateOnly(n.date),
        subject: String(n.subject ?? ""),
        detail: String(n.detail ?? ""),
        createdAt: n.created_at as string | undefined,
      })),
      communications: comms.map<Communication>((c) => ({
        id: String(c.id),
        type: String(c.type).startsWith("Phone") ? "phone" : "email",
        date: dateOnly(c.date),
        subject: String(c.subject ?? ""),
        body: String(c.body ?? ""),
        senders: ((c.senders as Json[]) ?? []).map(party),
        receivers: ((c.receivers as Json[]) ?? []).map(party),
        createdAt: c.created_at as string | undefined,
      })),
      tasks: tasks.map<Task>((t) => ({
        id: String(t.id),
        name: String(t.name ?? ""),
        description: String(t.description ?? ""),
        dueAt: t.due_at ? dateOnly(t.due_at) : null,
        status: String(t.status ?? "pending"),
        isStatuteOfLimitations: Boolean(t.statute_of_limitations),
        createdAt: t.created_at as string | undefined,
      })),
      calendarEntries: cal.map<CalendarEntry>((c) => ({
        id: String(c.id),
        summary: String(c.summary ?? ""),
        description: String(c.description ?? ""),
        startAt: String(c.start_at),
        endAt: String(c.end_at),
        createdAt: c.created_at as string | undefined,
      })),
      expenses: expenses.map<Expense>((e) => ({
        id: String(e.id),
        date: dateOnly(e.date),
        quantity: Number(e.quantity ?? 1),
        price: Number(e.price ?? 0),
        total: Number(e.total ?? Number(e.quantity ?? 1) * Number(e.price ?? 0)),
        note: String(e.note ?? ""),
      })),
      documents: docs.map<ClioDocument>((d) => ({
        id: String(d.id),
        name: String(d.name ?? ""),
        folder: String((d.parent as Json | undefined)?.name ?? ""),
        receivedAt: String(d.received_at ?? ""),
      })),
      origin: "clio",
      fetchedAt: new Date().toISOString(),
    };
  }
}
