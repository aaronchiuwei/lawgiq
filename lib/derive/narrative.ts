import type { MatterBundle, SourceRef } from "../clio/types";
import type { Kpis } from "./kpis";
import type { RankedEvent } from "./rank";
import type { Treatment } from "./treatment";
import { addDays, findField, firstSentences } from "./util";

/** A sentence of generated prose with the records it was built from. */
export interface DigestSentence {
  text: string;
  sources: SourceRef[];
}

export interface Digest {
  sentences: DigestSentence[];
  /** Optional AI re-wording of why each top event matters, keyed by event id. */
  reasons?: Record<string, string>;
  generator: { kind: "rules" | "ai"; model?: string };
  generatedAt: string;
  itemCount: number;
  inputHash: string;
}

const fmtMonth = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const fmtDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/**
 * Deterministic 3–4 sentence summary assembled from fields and derived facts.
 * Used when no AI key is configured, and as the grounding the AI digest must
 * stay consistent with.
 */
export function rulesDigest(
  bundle: MatterBundle,
  kpis: Kpis,
  treatment: Treatment,
  clientName: string,
  itemCount: number,
  inputHash: string,
  coverageDisputed = false,
): Digest {
  const sentences: DigestSentence[] = [];
  const summary = findField(bundle, "Case Summary");
  const doi = treatment.dateOfIncident;

  if (summary && typeof summary.value === "string") {
    let first = firstSentences(summary.value, 1).replace(/\.$/, "");
    // "Sideswiped by ..." reads as a participle; make it a sentence about the client.
    if (/^[A-Z][a-z]+ed\b/.test(first)) first = `was ${first.charAt(0).toLowerCase()}${first.slice(1)}`;
    else first = `: ${first}`;
    sentences.push({
      text: `${doi ? `On ${fmtDay(doi)}, ` : ""}${clientName} ${first}.`.replace(" :", ":"),
      sources: [summary.source],
    });
  }

  const regions = treatment.injuries.map((i) => i.prose);
  const performed = treatment.procedures.filter((p) => p.status === "performed");
  const recommended = treatment.procedures.filter((p) => p.status === "recommended");
  if (regions.length || performed.length) {
    const parts: string[] = [];
    if (regions.length) parts.push(`Injuries claimed to the ${regions.slice(0, -1).join(", ")}${regions.length > 1 ? " and " : ""}${regions.at(-1)}`);
    if (performed.length) parts.push(`${performed.map((p) => `a ${p.label} in ${fmtMonth(p.date!)}`).join(" and ")}`);
    let text = parts.join("; surgery so far: ");
    if (recommended.length)
      text += `. A ${recommended[0].label} recommended in ${fmtMonth(recommended[0].date!)} still has no date`;
    sentences.push({
      text: `${text}.`,
      sources: [...treatment.injuries.flatMap((i) => i.claimedIn.slice(0, 1)), ...performed.map((p) => p.source), ...recommended.map((p) => p.source)].slice(0, 4),
    });
  }

  const stage = bundle.matter.stage;
  if (stage) {
    let status = treatment.statusText ? firstSentences(treatment.statusText.value, 1).replace(/\.$/, "") : "";
    if (status) status = `; treatment is ${status.charAt(0).toLowerCase()}${status.slice(1)}`;
    sentences.push({
      text: `The matter is in ${stage}${status}.`,
      sources: treatment.statusText ? [treatment.statusText.source] : [],
    });
  }

  if (kpis.estimatedValue && kpis.coverage.defendantLimit && kpis.coverage.gap) {
    const over = kpis.coverage.gap.value > 0;
    sentences.push({
      text: over
        ? `Estimated value of ${usd(kpis.estimatedValue.value)} exceeds the ${usd(kpis.coverage.defendantLimit.value)} per-person limit on record${kpis.coverage.confirmed && !coverageDisputed ? " (confirmed)" : ""} by ${usd(kpis.coverage.gap.value)}${coverageDisputed ? ", though one record questions whose policy that limit is" : ""}.`
        : `Estimated value of ${usd(kpis.estimatedValue.value)} sits within the ${usd(kpis.coverage.defendantLimit.value)} per-person limit.`,
      sources: [kpis.estimatedValue.source, kpis.coverage.defendantLimit.source, ...(kpis.coverage.confirmedBy ? [kpis.coverage.confirmedBy] : [])],
    });
  }

  return {
    sentences,
    generator: { kind: "rules" },
    generatedAt: new Date().toISOString(),
    itemCount,
    inputHash,
  };
}

export interface ChangeItem {
  id: string;
  date: string;
  title: string;
  reason: string | null;
  kind: RankedEvent["kind"];
  source: SourceRef;
}

export function whatChanged(events: RankedEvent[], today: string, lastOpenedAt: string | null, lookbackDays: number) {
  const since = lastOpenedAt ?? `${addDays(today, -lookbackDays)}T00:00:00Z`;
  const items: ChangeItem[] = events
    .filter((e) => e.date <= today)
    .filter((e) => (e.createdAt ?? `${e.date}T23:59:59Z`) > since)
    .sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score)
    .map((e) => ({ id: e.id, date: e.date, title: e.title, reason: e.reason, kind: e.kind, source: e.source }));
  return { since, firstVisit: !lastOpenedAt, items };
}

export interface Milestone {
  id: string;
  date: string;
  /** Plain-English, provider/client-safe wording from the rank rule. */
  text: string;
  category: RankedEvent["category"];
  providerIds: string[];
  ruleId: string;
}

/** Stage-level milestones in plain English, one per rule per 30 days. */
export function milestones(events: RankedEvent[], today: string): Milestone[] {
  const out: Milestone[] = [];
  for (const e of [...events].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!e.milestone || !e.plain || !e.ruleId || e.date > today) continue;
    const prev = out.find((m) => m.ruleId === e.ruleId && (e.once || Date.parse(e.date) - Date.parse(m.date) <= 30 * 86_400_000));
    if (prev) continue;
    out.push({ id: e.id, date: e.date, text: e.plain, category: e.category, providerIds: e.providerIds, ruleId: e.ruleId });
  }
  return out;
}
