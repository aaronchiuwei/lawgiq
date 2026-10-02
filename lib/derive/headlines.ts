import type { CaseFile } from "./index";
import type { Procedure } from "./treatment";
import { fmtDate, fmtUsd, relDays } from "../format";

/**
 * Answer-first headlines: each section of the case reduced to one sentence,
 * built only from derived values. Reading the headlines alone should be
 * enough to know the case. Nothing here names a case fact; every phrase is a
 * template over the CaseFile.
 */

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
export const countWord = (n: number, lower = false) => {
  const w = n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
  return lower ? w.toLowerCase() : w;
};
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

export interface Headline {
  /** The one-sentence answer. */
  text: string;
  /** A short supporting line for the brief depth. */
  sub: string | null;
  /** The figure that stands in for the section at glance depth. */
  figure: string | null;
}

export interface MoneyHeadline {
  value: number | null;
  limit: number | null;
  gap: number | null;
  /** Billed specials already exceed the limit on their own. */
  specialsOverLimit: boolean;
}

export interface CaseHeadlines {
  money: MoneyHeadline;
  needs: Headline;
  story: Headline;
  injuries: Headline;
  care: Headline;
  specials: Headline;
  liability: Headline;
  strength: Headline & { weakest: { id: string; label: string; score: number } | null };
}

export function deriveHeadlines(c: CaseFile): CaseHeadlines {
  return {
    money: money(c),
    needs: needs(c),
    story: story(c),
    injuries: injuries(c),
    care: care(c),
    specials: specials(c),
    liability: liability(c),
    strength: strength(c),
  };
}

function money(c: CaseFile): MoneyHeadline {
  const value = c.kpis.estimatedValue?.value ?? null;
  const limit = c.kpis.coverage.defendantLimit?.value ?? null;
  const gap = value !== null && limit !== null ? value - limit : null;
  const specialsTotal = c.kpis.specials?.value ?? null;
  return { value, limit, gap, specialsOverLimit: specialsTotal !== null && limit !== null && specialsTotal > limit };
}

function needs(c: CaseFile): Headline {
  const { overdue, comingUp, waiting } = c.tasks;
  const parts: string[] = [];
  if (overdue.length) parts.push(`${countWord(overdue.length)} overdue`);
  if (waiting.length) parts.push(`${countWord(waiting.length, !!parts.length)} waiting on others`);
  const next = comingUp.find((t) => t.due);
  const text = parts.length ? `${parts.join(", ")}.` : "Nothing overdue.";
  return {
    text,
    sub: next ? `Next due ${relDays(next.daysUntilDue)}: ${next.title}` : null,
    figure: overdue.length ? `${overdue.length} overdue` : `${comingUp.length} due`,
  };
}

function story(c: CaseFile): Headline {
  const lm = c.lastMovement;
  const counts = new Map<string, number>();
  for (const e of c.topEvents) {
    const k = e.category === "liability" ? "liability" : e.category === "medical" ? "medical" : "legal and money";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const split = [...counts.entries()].map(([k, n]) => `${countWord(n, true)} ${k}`).join(", ");
  return {
    text: lm ? `Last real movement ${fmtDate(lm.date, { year: false })}: ${lm.text.charAt(0).toLowerCase()}${lm.text.slice(1)}.` : "No milestones recorded yet.",
    sub: c.topEvents.length ? `The ${countWord(c.topEvents.length, true)} moments that shaped it, ranked from ${c.events.length} records: ${split}.` : null,
    figure: lm ? fmtDate(lm.date, { year: false }) : null,
  };
}

function injuries(c: CaseFile): Headline {
  const regions = c.treatment.injuries.length;
  const done = c.treatment.procedures.filter((p) => p.status === "performed").length;
  const pending = c.treatment.procedures.filter((p) => p.status === "recommended");
  const bits = [`${countWord(regions)} ${plural(regions, "region")} injured`];
  if (done) bits.push(`${countWord(done, true)} ${plural(done, "surgery", "surgeries")} done`);
  if (pending.length) bits.push(`${countWord(pending.length, true)} recommended and still undated`);
  const imaging = c.treatment.injuries.reduce((n, i) => n + i.imaging.length, 0);
  return {
    text: `${bits.join("; ")}.`,
    sub: imaging ? `${countWord(imaging)} imaging ${plural(imaging, "study", "studies")} with findings on file.` : "No imaging findings summarised in the notes.",
    figure: `${regions} ${plural(regions, "region")}`,
  };
}

function care(c: CaseFile): Headline {
  const rows = c.treatment.providers;
  const active = rows.filter((r) => r.status === "active" || r.status === "scheduled").length;
  const gaps = rows.reduce((n, r) => n + r.gaps.length, 0);
  const owe = c.tasks.waiting.filter((t) => t.providerIds.length).length;
  return {
    text: `${countWord(active)} of ${rows.length} providers still treating; ${countWord(gaps, true)} ${plural(gaps, "gap")} over ${c.thresholds.treatmentGapDays} days.`,
    sub: owe ? `${countWord(owe)} ${plural(owe, "provider owes", "providers owe")} the firm records.` : null,
    figure: `${active}/${rows.length} treating`,
  };
}

function specials(c: CaseFile): Headline {
  const s = c.kpis.specials;
  if (!s) return { text: "No specials figure on file.", sub: null, figure: null };
  const unreconciled = c.specials?.uncertainLabels.length ?? 0;
  const m = money(c);
  const over = m.specialsOverLimit && m.limit !== null ? `, already more than the ${fmtUsd(m.limit)} limit` : "";
  return {
    text: `${fmtUsd(s.value)} billed${over}.`,
    sub: s.interim
      ? `Interim${unreconciled ? `: ${countWord(unreconciled, true)} ${plural(unreconciled, "ledger")} unreconciled` : ""}${c.specials?.coverage ? `, bills from ${c.specials.coverage.reported} of ${c.specials.coverage.of} providers` : ""}.`
      : null,
    figure: fmtUsd(s.value, { compact: true }),
  };
}

function liability(c: CaseFile): Headline {
  const l = c.liability;
  const high = l.risks.filter((r) => r.severity === 3).length;
  const text = l.crux
    ? `Turns on ${l.crux.question.toLowerCase()}${l.crux.resolved ? "." : ", still unresolved."}`
    : l.assessment
      ? l.assessment.text
      : l.risks.length
        ? `${countWord(l.risks.length)} ${plural(l.risks.length, "risk")} in the file.`
        : "No liability notes in the file.";
  return {
    text,
    sub: l.risks.length ? `${countWord(high)} high ${plural(high, "risk")} of ${l.risks.length} in the file${l.assessment && l.crux ? `. ${l.assessment.text}` : "."}` : null,
    figure: high ? `${high} high ${plural(high, "risk")}` : `${l.risks.length} risks`,
  };
}

function strength(c: CaseFile): CaseHeadlines["strength"] {
  const s = c.scorecard;
  // The factor costing the most weighted points.
  const weakest = [...s.factors].sort((a, b) => (5 - b.score) * b.weight - (5 - a.score) * a.weight)[0] ?? null;
  const strongest = [...s.factors].sort((a, b) => b.score - a.score)[0] ?? null;
  return {
    text: weakest ? `${s.total}/100, held back most by ${weakest.label.toLowerCase()}.` : `${s.total}/100.`,
    sub: strongest && strongest !== weakest ? `Strongest on ${strongest.label.toLowerCase()} (${strongest.score.toFixed(1)} of 5).` : null,
    figure: `${s.total}`,
    weakest: weakest ? { id: weakest.id, label: weakest.label, score: weakest.score } : null,
  };
}

/* ------------------------------------------------------------- anatomy -- */

/** Hotspots on a schematic figure seen from behind (so the client's left is on the left). */
export type BodySpot = "head" | "neck" | "shoulder-l" | "shoulder-r" | "upper-back" | "lower-back" | "hip-l" | "hip-r" | "wrist-l" | "wrist-r" | "knee-l" | "knee-r" | "ankle-l" | "ankle-r";

const SPOTS: { re: RegExp; spots: BodySpot[] | [BodySpot, BodySpot] ; paired: boolean }[] = [
  { re: /head|brain|tbi/i, spots: ["head"], paired: false },
  { re: /cervical|neck/i, spots: ["neck"], paired: false },
  { re: /thoracic|upper back/i, spots: ["upper-back"], paired: false },
  { re: /lumbar|lower back|low back/i, spots: ["lower-back"], paired: false },
  { re: /shoulder/i, spots: ["shoulder-l", "shoulder-r"], paired: true },
  { re: /\bhip/i, spots: ["hip-l", "hip-r"], paired: true },
  { re: /wrist|hand/i, spots: ["wrist-l", "wrist-r"], paired: true },
  { re: /knee/i, spots: ["knee-l", "knee-r"], paired: true },
  { re: /ankle|foot/i, spots: ["ankle-l", "ankle-r"], paired: true },
];

/** Which hotspots a region or procedure label lights, honouring "left"/"right". */
export function spotsFor(text: string): BodySpot[] {
  const hit = SPOTS.find((s) => s.re.test(text));
  if (!hit) return [];
  if (!hit.paired) return [...hit.spots];
  const left = /\bleft\b/i.test(text);
  const right = /\bright\b/i.test(text);
  if (left && !right) return [hit.spots[0]];
  if (right && !left) return [hit.spots[1]];
  return [...hit.spots];
}

export function procedureSpots(p: Procedure): BodySpot[] {
  return spotsFor(p.label);
}
