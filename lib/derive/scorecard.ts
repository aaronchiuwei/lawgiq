import type { SourceRef } from "../clio/types";
import type { Kpis } from "./kpis";
import type { Liability } from "./liability";
import type { SpecialsBreakdown } from "./specials";
import type { Treatment } from "./treatment";

/**
 * Factor-based case strength score. Every factor shows its weight, its score
 * out of 5, and the evidence (with sources) that moved it. This is a
 * transparent rubric, not a prediction of outcome.
 */

export interface Evidence {
  text: string;
  /** Points this evidence added or removed. */
  delta: number;
  sources: SourceRef[];
}

export interface Factor {
  id: string;
  label: string;
  weight: number;
  score: number;
  evidence: Evidence[];
}

export interface Scorecard {
  total: number;
  factors: Factor[];
  method: string;
}

const clamp = (n: number) => Math.max(0, Math.min(5, Math.round(n * 10) / 10));

function factor(id: string, label: string, weight: number, base: number, evidence: Evidence[]): Factor {
  return { id, label, weight, score: clamp(base + evidence.reduce((s, e) => s + e.delta, 0)), evidence };
}

export function deriveScorecard(kpis: Kpis, liability: Liability, treatment: Treatment, specials: SpecialsBreakdown | null): Scorecard {
  const risk = (id: string) => liability.risks.find((r) => r.id === id);

  const liabilityEv: Evidence[] = [];
  if (liability.assessment && /contested/i.test(liability.assessment.text))
    liabilityEv.push({ text: `Liability assessment: “${liability.assessment.text}”`, delta: -1.5, sources: [liability.assessment.source] });
  if (liability.crux && !liability.crux.resolved)
    liabilityEv.push({ text: `Unresolved: ${liability.crux.question.toLowerCase()} decides whether the deep-pocket defendant stays in`, delta: -1, sources: [liability.crux.source] });
  for (const id of ["no-police-report", "accounts"]) {
    const r = risk(id);
    if (r) liabilityEv.push({ text: r.label, delta: -0.75, sources: r.sources });
  }
  if (liability.adverse.length)
    liabilityEv.push({ text: `${liability.adverse.length} adverse parties identified`, delta: 0.5, sources: liability.adverse.map((a) => a.source) });

  const injuryEv: Evidence[] = [];
  for (const p of treatment.procedures) {
    if (p.status === "performed") injuryEv.push({ text: `Performed: ${p.label} (${p.date})`, delta: 1.5, sources: [p.source] });
    else injuryEv.push({ text: `Recommended, not yet scheduled: ${p.label}`, delta: 0.75, sources: [p.source, ...p.also] });
  }
  const studies = treatment.injuries.flatMap((i) => i.imaging);
  const uniqueStudies = [...new Map(studies.map((s) => [s.study, s])).values()];
  if (uniqueStudies.length)
    injuryEv.push({ text: `${uniqueStudies.length} imaging studies with positive findings`, delta: Math.min(1.5, uniqueStudies.length * 0.3), sources: [uniqueStudies[0].source] });
  if (treatment.statusText && /ongoing|never discharged/i.test(treatment.statusText.value))
    injuryEv.push({ text: "Treatment ongoing, no MMI declared", delta: 0.5, sources: [treatment.statusText.source] });
  for (const id of ["ct-clean", "developmental"]) {
    const r = risk(id);
    if (r) injuryEv.push({ text: r.label, delta: -0.5, sources: r.sources });
  }

  const damagesEv: Evidence[] = [];
  if (kpis.specials?.interim)
    damagesEv.push({ text: "Specials figure is interim (ledgers unreconciled)", delta: -1, sources: [kpis.specials.source, ...(kpis.specials.interimReason ? [kpis.specials.interimReason] : [])] });
  if (specials?.coverage && specials.coverage.reported < specials.coverage.of)
    damagesEv.push({
      text: `Bills from ${specials.coverage.reported} of ${specials.coverage.of} providers`,
      delta: -0.5 * (specials.coverage.of - specials.coverage.reported),
      sources: [specials.source],
    });
  const wage = risk("wage-proof");
  if (wage) damagesEv.push({ text: wage.label, delta: -1, sources: wage.sources });

  const coverageEv: Evidence[] = [];
  let coverageBase = 2.5;
  if (kpis.estimatedValue && kpis.coverage.defendantLimit) {
    const ratio = kpis.coverage.defendantLimit.value / kpis.estimatedValue.value;
    coverageBase = 0;
    coverageEv.push({
      text: `Per-person limit covers ${Math.round(ratio * 100)}% of estimated value`,
      delta: clamp(5 * Math.min(1, ratio)),
      sources: [kpis.coverage.defendantLimit.source, kpis.estimatedValue.source],
    });
  }
  if (kpis.coverage.confirmed && kpis.coverage.confirmedBy)
    coverageEv.push({ text: "Limits confirmed in writing", delta: 0.5, sources: [kpis.coverage.confirmedBy] });
  for (const l of kpis.liens) coverageEv.push({ text: `${l.holder} lien comes off the recovery`, delta: -0.25, sources: [l.source] });

  const continuityEv: Evidence[] = [];
  const gaps = treatment.providers.flatMap((p) => p.gaps.filter((g) => !g.trailing));
  if (gaps.length) continuityEv.push({ text: `${gaps.length} documentation gaps longer than the threshold across providers`, delta: -0.4 * Math.min(gaps.length, 5), sources: [] });
  const active = treatment.providers.filter((p) => p.status === "scheduled" || p.status === "active");
  if (active.length) continuityEv.push({ text: `${active.length} providers still treating`, delta: 0.5, sources: [] });

  const credEv: Evidence[] = liability.risks
    .filter((r) => r.credibility)
    .map((r) => ({ text: r.label, delta: -1, sources: r.sources }));

  const factors = [
    factor("liability", "Liability", 30, 4, liabilityEv),
    factor("injury", "Injury severity & proof", 25, 1.5, injuryEv),
    factor("damages", "Damages documentation", 15, 4, damagesEv),
    factor("coverage", "Collectability", 15, coverageBase, coverageEv),
    factor("continuity", "Treatment continuity", 10, 3.5, continuityEv),
    factor("credibility", "Client credibility", 5, 4.5, credEv),
  ];
  const total = Math.round(factors.reduce((s, f) => s + (f.score / 5) * f.weight, 0));
  return {
    total,
    factors,
    method:
      "Each factor starts from a neutral base and moves by the evidence listed under it, clamped to 0–5. The total is the weighted average scaled to 100. Rules-based and fully traceable; it does not predict an outcome.",
  };
}
