/**
 * Domain model for one Clio matter, normalised from Clio Manage API v4 responses.
 * Built from the Python pipeline's output (lib/clio/pipeline.ts).
 */

export type SourceKind =
  | "matter"
  | "custom_field"
  | "contact"
  | "relationship"
  | "note"
  | "communication"
  | "task"
  | "calendar_entry"
  | "expense"
  | "document";

/** A pointer back to the Clio record a value was read from. */
export interface SourceRef {
  kind: SourceKind;
  id: string;
  /** Human label, e.g. "Note · Coverage confirmed in writing". */
  label: string;
  /** ISO date of the source record, when it has one. */
  date?: string;
  /** Short excerpt shown in hover previews and the source drawer. */
  snippet?: string;
  /** Full text for the drawer (notes, emails). */
  body?: string;
  /** Deep link into Clio. */
  clioUrl: string | null;
}

export interface CustomFieldValue {
  fieldId: string;
  name: string;
  fieldType: string;
  value: string | number | boolean | null;
  source: SourceRef;
}

export interface Contact {
  id: string;
  type: "Person" | "Company";
  name: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  dateOfBirth?: string;
  emails: { name: string; address: string }[];
  phones: { name: string; number: string }[];
  addresses: { name: string; street: string; city: string; province: string; postalCode: string }[];
  /** Avatar URL if Clio returns one. Clio's seed data has none. */
  avatarUrl: string | null;
}

export interface Relationship {
  id: string;
  contactId: string;
  description: string;
}

export interface Note {
  id: string;
  date: string;
  subject: string;
  detail: string;
  createdAt?: string;
}

export interface Party {
  kind: "user" | "contact";
  id: string;
}

export interface Communication {
  id: string;
  type: "email" | "phone";
  date: string;
  subject: string;
  body: string;
  senders: Party[];
  receivers: Party[];
  createdAt?: string;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  dueAt: string | null;
  status: "pending" | "complete" | string;
  isStatuteOfLimitations: boolean;
  createdAt?: string;
}

export interface CalendarEntry {
  id: string;
  summary: string;
  description: string;
  startAt: string;
  endAt: string;
  createdAt?: string;
}

export interface Expense {
  id: string;
  date: string;
  quantity: number;
  price: number;
  total: number;
  note: string;
}

export interface ClioDocument {
  id: string;
  name: string;
  folder: string;
  receivedAt: string;
  bytes?: number;
  /** From ocr_pipeline.py, when the document has been processed. */
  pageCount?: number;
  ocrExcerpt?: string;
}

/** One entry's Jev scores from scripts/triage.py (data/triage). */
export interface TriageScore {
  /** 0.75 × impact + 0.25 × urgency, 0–1. */
  importance: number;
  impact: number;
  urgency: number;
  category: string;
  shareableProb: number;
  shareable: "share" | "review" | "internal";
  /** The document's own date Jev picked from its text, when confident. */
  documentDate: string | null;
}

export interface Matter {
  id: string;
  description: string;
  status: string;
  openDate: string;
  statuteOfLimitations: string | null;
  stage: string | null;
  /** Ordered pipeline for the practice area (Clio matter_stages). */
  stagesInOrder: string[];
  practiceArea: string | null;
  clientId: string;
  clioUrl: string | null;
}

export interface MatterBundle {
  matter: Matter;
  customFields: CustomFieldValue[];
  contacts: Contact[];
  relationships: Relationship[];
  notes: Note[];
  communications: Communication[];
  tasks: Task[];
  calendarEntries: CalendarEntry[];
  expenses: Expense[];
  documents: ClioDocument[];
  /** Jev triage keyed by `${source_type}:${id}` (note, communication, task, calendar_entry, document). */
  triage: Record<string, TriageScore>;
  /** Where this bundle came from. */
  origin: "clio";
  fetchedAt: string;
}

export interface MatterSource {
  readonly origin: "clio";
  loadMatter(): Promise<MatterBundle>;
}
