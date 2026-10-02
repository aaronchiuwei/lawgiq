import { createHash } from "node:crypto";
import type { Contact, MatterBundle, SourceRef } from "../clio/types";
import { DERIVE_DEFAULTS, type DeriveOptions } from "./config";
import { deriveConflicts, type Conflict } from "./conflicts";
import { deriveClientContact, deriveDeadlines, deriveSol, type ClientContact, type Deadline, type SolDeadline } from "./deadlines";
import { buildEvents } from "./events";
import { deriveKpis, type Kpis } from "./kpis";
import { deriveLiability, type Liability } from "./liability";
import { milestones, rulesDigest, whatChanged, type ChangeItem, type Digest, type Milestone } from "./narrative";
import { deriveProviders, type Provider } from "./providers";
import { rankTopEvents, scoreEvent, type RankedEvent } from "./rank";
import { deriveScorecard, type Scorecard } from "./scorecard";
import { deriveSpecials, type SpecialsBreakdown } from "./specials";
import { deriveTaskBoard, type TaskBoard } from "./task-board";
import { bucketTasks, type TaskBuckets } from "./tasks";
import { deriveTreatment, type Treatment } from "./treatment";
import { findField, isoDay, sourceFactory } from "./util";

export type { ChangeItem, Conflict, Deadline, Digest, Kpis, Liability, Milestone, Provider, RankedEvent, Scorecard, SolDeadline, SpecialsBreakdown, TaskBoard, TaskBuckets, Treatment, ClientContact };

/**
 * Everything the firm view can know about one matter, derived from the Clio
 * bundle. Role-scoped views (lib/access) are cut from this, never the reverse.
 */
export interface CaseFile {
  today: string;
  origin: MatterBundle["origin"];
  fetchedAt: string;
  inputHash: string;
  itemCount: number;
  matter: {
    id: string;
    description: string;
    stage: string | null;
    stagesInOrder: string[];
    openDate: string;
    practiceArea: string | null;
    caseType: string;
    dateOfIncident: { value: string; source: SourceRef } | null;
    location: { value: string; source: SourceRef } | null;
    clioUrl: string | null;
  };
  client: Contact & { source: SourceRef };
  providers: Provider[];
  kpis: Kpis;
  digest: Digest;
  changes: ReturnType<typeof whatChanged>;
  tasks: TaskBuckets;
  /** Every task in board columns with its related records. Firm view only. */
  taskBoard: TaskBoard;
  sol: SolDeadline;
  deadlines: Deadline[];
  clientContact: ClientContact;
  events: RankedEvent[];
  topEvents: RankedEvent[];
  treatment: Treatment;
  specials: SpecialsBreakdown | null;
  liability: Liability;
  scorecard: Scorecard;
  conflicts: Conflict[];
  milestones: Milestone[];
  /** The latest milestone: "last real movement" on the case. */
  lastMovement: Milestone | null;
  thresholds: { clientContactStaleDays: number; treatmentGapDays: number };
}

/** Stable hash of the case data (ignores fetchedAt) for digest caching. */
export function bundleHash(bundle: MatterBundle): string {
  const { fetchedAt: _f, ...rest } = bundle;
  void _f;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex").slice(0, 16);
}

export function bundleItemCount(b: MatterBundle): number {
  return b.notes.length + b.communications.length + b.tasks.length + b.calendarEntries.length + b.expenses.length + b.documents.length + b.customFields.length;
}

export function deriveCase(bundle: MatterBundle, opts: Partial<DeriveOptions> & { today: string }, digestOverride?: Digest | null): CaseFile {
  const options: DeriveOptions = {
    lastOpenedAt: null,
    clientContactStaleDays: DERIVE_DEFAULTS.clientContactStaleDays,
    treatmentGapDays: DERIVE_DEFAULTS.treatmentGapDays,
    ...opts,
  };
  const { today } = options;
  const source = sourceFactory(bundle);
  const providers = deriveProviders(bundle, source);
  const events = buildEvents(bundle, providers, source).map(scoreEvent);
  const kpis = deriveKpis(bundle, events, source);
  const tasks = bucketTasks(bundle, today, providers, source);
  const treatment = deriveTreatment(bundle, events, providers, today, options.treatmentGapDays);
  const specials = deriveSpecials(events, providers);
  const liability = deriveLiability(bundle, events, source);
  const scorecard = deriveScorecard(kpis, liability, treatment, specials);
  const conflicts = deriveConflicts(bundle, events, tasks);
  const ms = milestones(events, today);
  const inputHash = bundleHash(bundle);
  const itemCount = bundleItemCount(bundle);

  const clientContact = bundle.contacts.find((c) => c.id === bundle.matter.clientId);
  if (!clientContact) throw new Error("Matter client contact not found");
  const clientName = clientContact.name;

  const doi = findField(bundle, "Date of Incident");
  const loc = findField(bundle, "Accident Location");
  const caseType = (bundle.matter.description.match(/[—-]\s*([A-Z]{2,}[A-Za-z ]*)/)?.[1] ?? bundle.matter.practiceArea ?? "").trim();

  return {
    today,
    origin: bundle.origin,
    fetchedAt: bundle.fetchedAt,
    inputHash,
    itemCount,
    matter: {
      id: bundle.matter.id,
      description: bundle.matter.description,
      stage: bundle.matter.stage,
      stagesInOrder: bundle.matter.stagesInOrder,
      openDate: bundle.matter.openDate,
      practiceArea: bundle.matter.practiceArea,
      caseType,
      dateOfIncident: doi && typeof doi.value === "string" ? { value: isoDay(doi.value), source: doi.source } : null,
      location: loc && typeof loc.value === "string" ? { value: loc.value, source: loc.source } : null,
      clioUrl: bundle.matter.clioUrl,
    },
    client: { ...clientContact, source: source("contact", clientContact.id, `Contact · ${clientName}`) },
    providers,
    kpis,
    digest: digestOverride ?? rulesDigest(bundle, kpis, treatment, clientName, itemCount, inputHash, conflicts.some((x) => x.anchor === "coverage")),
    changes: whatChanged(events, today, options.lastOpenedAt, DERIVE_DEFAULTS.firstVisitLookbackDays),
    tasks,
    taskBoard: deriveTaskBoard(bundle, today, source),
    sol: deriveSol(bundle, today, source),
    deadlines: deriveDeadlines(bundle, today, source),
    clientContact: deriveClientContact(bundle, today, options.clientContactStaleDays, source),
    events,
    topEvents: rankTopEvents(events, today, DERIVE_DEFAULTS.topEvents),
    treatment,
    specials,
    liability,
    scorecard,
    conflicts,
    milestones: ms,
    lastMovement: ms.at(-1) ?? null,
    thresholds: { clientContactStaleDays: options.clientContactStaleDays, treatmentGapDays: options.treatmentGapDays },
  };
}
