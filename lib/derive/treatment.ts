import type { MatterBundle, SourceRef } from "../clio/types";
import type { CaseEvent } from "./events";
import { providersImplied, type Provider } from "./providers";
import { addDays, daysBetween, findField, isoDay } from "./util";

/**
 * Injuries, procedures and treatment continuity, read out of notes, calendar
 * entries and custom fields. Treatment "gaps" here are DOCUMENTATION gaps: the
 * stretch between two dated records of care. That is exactly what defence
 * counsel will read as a gap, so it is the right thing to surface.
 */

export interface ImagingStudy {
  study: string;
  date: string | null;
  dayOffset: number | null;
  finding: string;
  source: SourceRef;
}

export interface Injury {
  region: string;
  prose: string;
  claimedIn: SourceRef[];
  imaging: ImagingStudy[];
}

export interface Procedure {
  label: string;
  status: "performed" | "recommended";
  date: string | null;
  /** Recommended-but-unscheduled procedures: days since recommended. */
  openForDays: number | null;
  followUps: number;
  source: SourceRef;
  also: SourceRef[];
}

export interface TreatmentPoint {
  date: string;
  label: string;
  kind: "visit" | "records" | "report" | "scheduled";
  source: SourceRef;
}

export interface TreatmentGap {
  from: string;
  to: string;
  days: number;
  /** "trailing" = from the last documented visit up to today. */
  trailing: boolean;
}

export interface ProviderTreatment {
  providerId: string;
  points: TreatmentPoint[];
  gaps: TreatmentGap[];
  firstSeen: string | null;
  lastSeen: string | null;
  nextScheduled: string | null;
  status: "active" | "scheduled" | "inactive" | "no-records";
}

export interface Treatment {
  injuries: Injury[];
  procedures: Procedure[];
  providers: ProviderTreatment[];
  statusText: Sourced | null;
  dateOfIncident: string | null;
}

type Sourced = { value: string; source: SourceRef };

/** Anatomical regions: generic vocabulary, not case facts. */
const REGIONS: { region: string; prose: string; re: RegExp }[] = [
  { region: "Cervical spine", prose: "neck", re: /cervical|neck/i },
  { region: "Lumbar spine", prose: "lower back", re: /lumbar|lower back|low back/i },
  { region: "Shoulders", prose: "shoulders", re: /shoulder/i },
  { region: "Knees", prose: "knees", re: /knee/i },
  { region: "Head / brain", prose: "head", re: /\bhead\b|brain|tbi/i },
  { region: "Ankle / foot", prose: "ankle", re: /ankle|foot/i },
  { region: "Hips", prose: "hips", re: /\bhip/i },
  { region: "Wrists / hands", prose: "wrists", re: /wrist|hand\b/i },
];

const PROCEDURE = /\b(?:(left|right|bilateral)\s+)?(shoulder|knee|hip|spine|cervical|lumbar|wrist|ankle)\s+(arthroscopy|surgery|repair|fusion|replacement|injection)/gi;
const SPECIFICITY: Record<string, number> = { surgery: 0, injection: 1, repair: 2, arthroscopy: 3, fusion: 3, replacement: 3 };

/** Most specific procedure named in the text, keyed by side + body part. */
function procedureOf(text: string): { key: string; label: string; side: string | null; part: string } | null {
  const found = [...text.matchAll(PROCEDURE)].map((m) => ({
    side: m[1]?.toLowerCase() ?? null,
    part: m[2].toLowerCase(),
    type: m[3].toLowerCase(),
  }));
  if (!found.length) return null;
  const best = found.sort((a, b) => Number(Boolean(b.side)) - Number(Boolean(a.side)) || SPECIFICITY[b.type] - SPECIFICITY[a.type])[0];
  const key = best.side ? `${best.side} ${best.part}` : best.part;
  return { key, label: `${key} ${best.type}`, side: best.side, part: best.part };
}

export function deriveTreatment(
  bundle: MatterBundle,
  events: CaseEvent[],
  providers: Provider[],
  today: string,
  gapDays: number,
): Treatment {
  const doiField = findField(bundle, "Date of Incident");
  const doi = typeof doiField?.value === "string" ? isoDay(doiField.value) : null;
  const notes = events.filter((e) => e.kind === "note");

  // Injuries claimed: case summary field + any "Injuries claimed:" line in notes.
  const claimTexts: { text: string; source: SourceRef }[] = [];
  const summary = findField(bundle, "Case Summary");
  if (summary && typeof summary.value === "string") claimTexts.push({ text: summary.value, source: summary.source });
  for (const n of notes) {
    const m = n.text.match(/injur(?:y|ies) claimed:\s*([^\n.]+)/i);
    if (m) claimTexts.push({ text: m[1], source: n.source });
  }

  // Imaging studies: "- <Study> (DOI + N): finding" lines.
  const studies: ImagingStudy[] = [];
  for (const n of notes) {
    for (const m of n.text.matchAll(/^-\s*(.+?)\s*\(DOI\s*\+\s*(\d+)\):\s*(.+)$/gim)) {
      const offset = Number(m[2]);
      studies.push({
        study: m[1].trim(),
        dayOffset: offset,
        date: doi ? addDays(doi, offset) : null,
        finding: m[3].trim(),
        source: n.source,
      });
    }
  }

  const injuries: Injury[] = REGIONS.map(({ region, prose, re }) => ({
    region,
    prose,
    claimedIn: claimTexts.filter((c) => re.test(c.text)).map((c) => c.source),
    imaging: studies.filter((s) => re.test(s.study)),
  })).filter((i) => i.claimedIn.length > 0);

  // Procedures: performed = a past calendar entry naming the procedure that is
  // not itself a consult / follow-up / call. Recommended = a record saying the
  // procedure is recommended with no performed or scheduled entry after it.
  const isLogistics = /consult|follow-up|follow up|\bcall\b|confirm|pre-operative|post-operative|review|chaser|request/i;
  const performed: Procedure[] = [];
  for (const e of events) {
    if (e.kind !== "calendar") continue;
    const proc = procedureOf(e.title);
    if (!proc || isLogistics.test(e.title) || e.date > today) continue;
    performed.push({ label: proc.label, status: "performed", date: e.date, openForDays: null, followUps: 0, source: e.source, also: [] });
  }
  const performedKeys = new Set(performed.map((p) => procedureOf(p.label)!.key));

  const recommended: (Procedure & { key: string; part: string })[] = [];
  for (const e of events) {
    const text = `${e.title}. ${e.text}`;
    if (!/recommend/i.test(text)) continue;
    const proc = procedureOf(text);
    if (!proc || performedKeys.has(proc.key)) continue;
    // An unsided mention ("the second shoulder surgery") folds into a sided
    // recommendation for the same body part.
    const existing = recommended.find((r) => r.key === proc.key || (r.part === proc.part && (!proc.side || !r.key.includes(" "))));
    if (existing) {
      existing.also.push(e.source);
      continue;
    }
    recommended.push({ key: proc.key, part: proc.part, label: proc.label, status: "recommended", date: e.date, openForDays: null, followUps: 0, source: e.source, also: [] });
  }
  const providerIds = new Set(providers.map((p) => p.id));
  for (const r of recommended) {
    const scheduled = events.some(
      (e) => e.kind === "calendar" && e.date >= today && procedureOf(e.title)?.key === r.key && !isLogistics.test(e.title),
    );
    const partRe = new RegExp(r.key.replace(" ", "\\s+"), "i");
    // Approaches to a provider asking for a date: emails/calls with a provider party.
    r.followUps = events.filter(
      (e) =>
        (e.kind === "email" || e.kind === "call") &&
        e.date > (r.date ?? "") &&
        e.outbound &&
        e.partyIds.some((id) => providerIds.has(id)) &&
        partRe.test(`${e.title} ${e.text}`) &&
        /date|schedul/i.test(`${e.title} ${e.text}`),
    ).length;
    r.openForDays = scheduled || !r.date ? null : daysBetween(r.date, today);
  }

  // Per-provider continuity, built from dated evidence of care.
  const VISIT = /treatment|session|surgery|arthroscopy|consult|follow-up/i;
  const NOT_VISIT = /client appointment|review|conference|\bcall\b|\bime\b|examination/i;
  const RECORDS = /records (received|enclosed)|file received|notes enclosed/i;
  const ATTEND = /(still|continues to|keep) (attend|going)|attend(s|ing)\b|once a week|twice a week|times weekly|re-examined/i;
  const NON_CARE = /\bime\b|independent (medical|orthopaedic|neurological)|defence (independent|medical)/i;

  const providerTreatment = providers.map((p) => {
    const points: (TreatmentPoint & { continuous?: boolean })[] = [];

    // "Hospital, emergency care DOI + 1" on the relationship itself.
    const rel = bundle.relationships.find((r) => r.contactId === p.id);
    const relOffset = rel?.description.match(/DOI\s*\+\s*(\d+)/i);
    if (doi && rel && relOffset) points.push({ date: addDays(doi, Number(relOffset[1])), label: rel.description, kind: "visit", source: p.source });

    for (const e of events) {
      if (e.kind === "document" || e.kind === "expense" || e.kind === "task") continue;
      if (NON_CARE.test(e.title)) continue;
      const hay = `${e.title} ${e.text}`;

      if (e.kind === "calendar") {
        if (e.providerIds.includes(p.id) && VISIT.test(e.title) && !NOT_VISIT.test(e.title))
          points.push({ date: e.date, label: e.title, kind: e.date > today ? "scheduled" : "visit", source: e.source });
        continue;
      }
      if (RECORDS.test(e.title)) {
        if (!e.providerIds.includes(p.id)) continue;
        const offsets = doi ? [...hay.matchAll(/DOI\s*\+\s*(\d+)/gi)].map((m) => Number(m[1])) : [];
        for (const o of offsets) points.push({ date: addDays(doi!, o), label: `In produced records: ${e.title}`, kind: "records", source: e.source });
        // "updated notes through the date of this letter" documents care up to today's letter.
        if (/through the date of|to date|since (the|your) last production/i.test(e.text))
          points.push({ date: e.date, label: `Records produced through ${e.date}`, kind: "records", source: e.source, continuous: true });
        continue;
      }
      if (e.date > today || /chaser|\brequest/i.test(e.title)) continue;
      // Attendance reported in the same sentence as this provider (by name or specialty).
      const sentences = e.text.split(/(?<=[.!?])\s+/);
      if (sentences.some((sn) => ATTEND.test(sn) && providersImplied(sn, providers).includes(p.id)))
        points.push({ date: e.date, label: `Attendance reported: ${e.title}`, kind: "report", source: e.source });
    }
    points.sort((a, b) => a.date.localeCompare(b.date));

    const past = points.filter((pt) => pt.kind !== "scheduled");
    // Build covered intervals: a records production spanning "DOI + 3 through
    // DOI + 212" covers everything between, and a later "since the last
    // production" batch continues the previous one.
    const intervals: [string, string][] = [];
    const bySource = new Map<string, string[]>();
    for (const pt of past) if (pt.kind === "records" && !pt.continuous) bySource.set(pt.source.id, [...(bySource.get(pt.source.id) ?? []), pt.date]);
    for (const dates of bySource.values()) intervals.push([dates[0], dates.at(-1)!]);
    let lastRecordsEnd: string | null = null;
    for (const pt of past) {
      if (pt.kind === "records" && !pt.continuous) lastRecordsEnd = bySource.get(pt.source.id)!.at(-1)!;
      if (pt.continuous && lastRecordsEnd) intervals.push([lastRecordsEnd, pt.date]);
      else if (pt.kind !== "records") intervals.push([pt.date, pt.date]);
      else if (pt.continuous) intervals.push([pt.date, pt.date]);
    }
    intervals.sort((a, b) => a[0].localeCompare(b[0]));
    const merged: [string, string][] = [];
    for (const iv of intervals) {
      const last = merged.at(-1);
      if (last && iv[0] <= last[1]) last[1] = iv[1] > last[1] ? iv[1] : last[1];
      else merged.push([...iv]);
    }
    const gaps: TreatmentGap[] = [];
    for (let i = 1; i < merged.length; i++) {
      const d = daysBetween(merged[i - 1][1], merged[i][0]);
      if (d > gapDays) gaps.push({ from: merged[i - 1][1], to: merged[i][0], days: d, trailing: false });
    }
    const lastSeen = past.at(-1)?.date ?? null;
    const nextScheduled = points.find((pt) => pt.kind === "scheduled")?.date ?? null;
    // Only ongoing care (several dated points) can have a trailing gap; a single
    // ER visit is not a gap.
    if (lastSeen && past.length >= 3 && daysBetween(lastSeen, today) > gapDays) {
      gaps.push({ from: lastSeen, to: today, days: daysBetween(lastSeen, today), trailing: true });
    }
    const status: ProviderTreatment["status"] = !points.length
      ? "no-records"
      : nextScheduled
        ? "scheduled"
        : lastSeen && daysBetween(lastSeen, today) <= gapDays
          ? "active"
          : "inactive";

    return {
      providerId: p.id,
      points: points.map((pt) => ({ date: pt.date, label: pt.label, kind: pt.kind, source: pt.source })),
      gaps,
      firstSeen: past[0]?.date ?? null,
      lastSeen,
      nextScheduled,
      status,
    };
  });

  const statusField = findField(bundle, "Treatment Status");
  return {
    injuries,
    procedures: [...performed, ...recommended.map((r): Procedure => ({ label: r.label, status: r.status, date: r.date, openForDays: r.openForDays, followUps: r.followUps, source: r.source, also: r.also }))].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
    providers: providerTreatment,
    statusText: statusField && typeof statusField.value === "string" ? { value: statusField.value, source: statusField.source } : null,
    dateOfIncident: doi,
  };
}

