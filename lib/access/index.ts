import type { SourceRef } from "../clio/types";
import type { CaseFile } from "../derive";
import type { ProviderVisibility } from "../db";
import { fmtDate } from "../format";
import { explainStage, nextStepForClient, plainAppointment, plainAsk } from "./plain";

/**
 * Role-scoped selectors. Each function builds a NEW object containing only the
 * fields its role may see; nothing is hidden with CSS. Server components call
 * these and pass the result to the client, so restricted data never reaches a
 * provider's or client's browser.
 */

export type Role = "firm" | "provider" | "client";

export interface Freshness {
  origin: "clio" | "fixture";
  fetchedAt: string;
  syncError: { message: string; at: string } | null;
  itemCount: number;
}

/* ------------------------------------------------------------------ firm -- */

export interface ShareSummary {
  id: string;
  providerId: string;
  providerName: string;
  sharedBy: string;
  createdAt: string;
  itemCount: number;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  token: string;
}

export interface FirmView {
  role: "firm";
  freshness: Freshness;
  case: CaseFile;
  photo: string | null;
  shares: ShareSummary[];
  /** Per provider: exactly what they'd see, with excluded items listed for toggling. */
  providerDrafts: ProviderDraft[];
}

export function selectFirmView(input: Omit<FirmView, "role">): FirmView {
  return { role: "firm", ...input };
}

/* -------------------------------------------------------------- provider -- */

export type ReleasableKind = "request" | "feed" | "bill" | "record" | "question" | "attendance";

export interface DraftItem {
  key: string;
  kind: ReleasableKind;
  label: string;
  included: boolean;
}

export interface ProviderDraft {
  providerId: string;
  providerName: string;
  showCoverageAmount: boolean;
  items: DraftItem[];
}

export interface ProviderView {
  role: "provider";
  freshness: Pick<Freshness, "fetchedAt" | "origin">;
  provider: { id: string; name: string; shortName: string; specialty: string };
  patient: { name: string; dateOfIncident: string | null };
  alive: {
    stage: string | null;
    stagesInOrder: string[];
    explainer: string | null;
    lastMovement: { date: string; text: string } | null;
  };
  coverage: { exists: boolean; confirmed: boolean; amount: number | null; amountWithheld: boolean };
  attendance: {
    released: boolean;
    points: { date: string; kind: "visit" | "records" | "scheduled" | "report"; label: string }[];
    gaps: { from: string; to: string; days: number; trailing: boolean }[];
    lastSeen: string | null;
    nextScheduled: string | null;
    gapThresholdDays: number;
    /** Plain answer to "is my patient showing up?" */
    verdict: "yes" | "booked" | "not-recently" | "unknown";
  };
  requests: { key: string; title: string; detail: string; due: string | null; daysUntilDue: number | null }[];
  questions: { key: string; text: string; since: string | null; days: number | null }[];
  feed: { key: string; date: string; text: string }[];
  bills: { key: string; label: string; detail: string | null; amount: number; beingReconciled: boolean }[];
  records: { key: string; date: string; label: string }[];
}

const ATTENDANCE_KEY = "attendance";

const daysSince = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** Everything a provider COULD be shown. Allowlisted by construction. */
function providerCandidates(c: CaseFile, providerId: string) {
  const provider = c.providers.find((p) => p.id === providerId);
  if (!provider) return null;
  const treatment = c.treatment.providers.find((t) => t.providerId === providerId);

  const requests = c.tasks.waiting
    .filter((t) => t.providerIds.includes(providerId))
    .map((t) => ({ key: `req:${t.id}`, title: t.title, detail: t.detail, due: t.due, daysUntilDue: t.daysUntilDue }));

  const questions = c.treatment.procedures
    .filter((p) => p.status === "recommended" && p.openForDays !== null)
    .filter((p) => {
      const ev = c.events.find((e) => e.source.id === p.source.id);
      return ev?.providerIds.includes(providerId);
    })
    .map((p) => ({
      key: `q:${p.label}`,
      text: `${p.label.charAt(0).toUpperCase()}${p.label.slice(1)} was recommended and has no date yet.`,
      since: p.date,
      days: p.openForDays,
    }));

  // Milestones: case-level ones for everybody; medical ones only when they're this provider's.
  const feed = c.milestones
    .filter((m) => m.category !== "medical" || m.providerIds.includes(providerId))
    .map((m) => ({ key: `feed:${m.id}`, date: m.date, text: m.text }));

  const bills = (c.specials?.lines ?? [])
    .filter((l) => l.providerId === providerId)
    .map((l) => ({ key: `bill:${l.label}`, label: l.label, detail: l.detail, amount: l.amount, beingReconciled: Boolean(c.specials?.uncertainLabels.includes(l.label)) }));

  const records = c.events
    .filter((e) => e.ruleId === "records" && e.kind !== "note" && e.providerIds.includes(providerId) && e.partyIds.includes(providerId))
    .map((e) => ({ key: `rec:${e.id}`, date: e.date, label: "Records received by the firm" }));

  const attendance = {
    points: (treatment?.points ?? []).map((p) => ({
      date: p.date,
      kind: p.kind,
      label:
        p.kind === "scheduled"
          ? "Scheduled visit"
          : p.kind === "records"
            ? "Covered by records you produced"
            : p.kind === "report"
              ? "Attendance reported to the firm"
              : "Visit on file",
    })),
    gaps: treatment?.gaps ?? [],
    lastSeen: treatment?.lastSeen ?? null,
    nextScheduled: treatment?.nextScheduled ?? null,
  };

  return { provider, requests, questions, feed, bills, records, attendance };
}

function isIncluded(vis: ProviderVisibility, key: string): boolean {
  return vis.items[key] ?? true;
}

export function selectProviderDraft(c: CaseFile, providerId: string, vis: ProviderVisibility): ProviderDraft | null {
  const cand = providerCandidates(c, providerId);
  if (!cand) return null;
  const item = (key: string, kind: ReleasableKind, label: string): DraftItem => ({ key, kind, label, included: isIncluded(vis, key) });
  return {
    providerId,
    providerName: cand.provider.name,
    showCoverageAmount: vis.showCoverageAmount,
    items: [
      item(ATTENDANCE_KEY, "attendance", `Attendance: ${cand.attendance.points.length} dated ${cand.attendance.points.length === 1 ? "record" : "records"}, ${cand.attendance.gaps.length} ${cand.attendance.gaps.length === 1 ? "gap" : "gaps"}`),
      ...cand.requests.map((r) => item(r.key, "request", r.title)),
      ...cand.questions.map((q) => item(q.key, "question", q.text)),
      ...cand.bills.map((b) => item(b.key, "bill", `${b.label}: $${b.amount.toLocaleString("en-US")}`)),
      ...cand.records.map((r) => item(r.key, "record", `${r.label} (${fmtDate(r.date)})`)),
      ...cand.feed.map((f) => item(f.key, "feed", `${fmtDate(f.date)}: ${f.text}`)),
    ],
  };
}

export function selectProviderView(c: CaseFile, providerId: string, vis: ProviderVisibility): ProviderView | null {
  const cand = providerCandidates(c, providerId);
  if (!cand) return null;
  const keep = <T extends { key: string }>(xs: T[]) => xs.filter((x) => isIncluded(vis, x.key));
  const feed = keep(cand.feed);
  const attendanceReleased = isIncluded(vis, ATTENDANCE_KEY);
  const limit = c.kpis.coverage.defendantLimit;
  const latestReleased = feed.at(-1) ?? null;

  return {
    role: "provider",
    freshness: { fetchedAt: c.fetchedAt, origin: c.origin },
    provider: { id: cand.provider.id, name: cand.provider.name, shortName: cand.provider.shortName, specialty: cand.provider.specialty },
    patient: { name: c.client.name, dateOfIncident: c.matter.dateOfIncident?.value ?? null },
    alive: {
      stage: c.matter.stage,
      stagesInOrder: c.matter.stagesInOrder,
      explainer: explainStage(c.matter.stage, "provider"),
      lastMovement: latestReleased ? { date: latestReleased.date, text: latestReleased.text } : null,
    },
    coverage: {
      exists: Boolean(limit),
      // When two records disagree about the coverage, a provider is not told it is confirmed.
      confirmed: c.kpis.coverage.confirmed && !c.conflicts.some((x) => x.anchor === "coverage"),
      amount: vis.showCoverageAmount && limit ? limit.value : null,
      amountWithheld: !vis.showCoverageAmount,
    },
    attendance: attendanceReleased
      ? {
          released: true,
          ...cand.attendance,
          gapThresholdDays: c.thresholds.treatmentGapDays,
          verdict: !cand.attendance.lastSeen
            ? "unknown"
            : daysSince(cand.attendance.lastSeen, c.today) <= c.thresholds.treatmentGapDays
              ? "yes"
              : cand.attendance.nextScheduled
                ? "booked"
                : "not-recently",
        }
      : { released: false, points: [], gaps: [], lastSeen: null, nextScheduled: null, gapThresholdDays: c.thresholds.treatmentGapDays, verdict: "unknown" },
    requests: keep(cand.requests),
    questions: keep(cand.questions),
    feed,
    bills: keep(cand.bills),
    records: keep(cand.records),
  };
}

/* ---------------------------------------------------------------- client -- */

export interface ClientView {
  role: "client";
  freshness: Pick<Freshness, "fetchedAt">;
  client: { firstName: string };
  stage: { current: string | null; stagesInOrder: string[]; explainer: string | null; next: { name: string; explainer: string | null } | null };
  nextAppointment: { date: string; title: string } | null;
  upcoming: { date: string; title: string }[];
  asks: { title: string; due: string | null; when: string | null }[];
  liens: { holders: string[] };
  feed: { date: string; text: string }[];
  lastSpoke: string | null;
}

const CLIENT_FEED_EXCLUDE = new Set(["expert", "discovery-dispute"]);

export function selectClientView(c: CaseFile): ClientView {
  const idx = c.matter.stage ? c.matter.stagesInOrder.indexOf(c.matter.stage) : -1;
  const nextStage = idx >= 0 ? c.matter.stagesInOrder[idx + 1] ?? null : null;

  const upcoming = c.events
    .filter((e) => e.kind === "calendar" && e.date >= c.today && /client/i.test(e.title))
    .map((e) => ({ date: e.date, title: plainAppointment(e.title) }));

  // Asks: tasks addressed to the client, merged with the meeting where they're due.
  const asks: ClientView["asks"] = [];
  for (const t of [...c.tasks.overdue, ...c.tasks.comingUp]) {
    const title = plainAsk(t.source.label.replace(/^Task · /, ""));
    if (!title) continue;
    const words = title.toLowerCase().split(/\W+/).filter((w) => w.length > 5);
    const meeting = c.events.find(
      (e) => e.kind === "calendar" && e.date >= c.today && /client appointment/i.test(e.title) && words.some((w) => e.title.toLowerCase().includes(w)),
    );
    asks.push({ title, due: t.due, when: meeting?.date ?? null });
  }

  return {
    role: "client",
    freshness: { fetchedAt: c.fetchedAt },
    client: { firstName: c.client.firstName ?? c.client.name.split(" ")[0] },
    stage: {
      current: c.matter.stage,
      stagesInOrder: c.matter.stagesInOrder,
      explainer: explainStage(c.matter.stage, "client"),
      next: nextStage ? { name: nextStage, explainer: nextStepForClient(c.matter.stage) } : null,
    },
    nextAppointment: upcoming[0] ?? null,
    upcoming: upcoming.slice(0, 4),
    asks,
    liens: { holders: c.kpis.liens.map((l) => l.holder.replace(/^New York State /, "")) },
    feed: c.milestones
      .filter((m) => m.category !== "medical" && !CLIENT_FEED_EXCLUDE.has(m.ruleId))
      .map((m) => ({ date: m.date, text: m.text })),
    lastSpoke: c.clientContact.last?.date ?? null,
  };
}

export type AnyView = FirmView | ProviderView | ClientView;
export type { SourceRef };
