import type { CaseEvent } from "./events";

/**
 * Rules-based significance ranking. Each rule names WHY an event matters, so
 * every ranked event carries a human reason ("Shifted liability", "Surgery").
 * Jev's importance score (scripts/triage.py, 0–1) adds up to JEV_WEIGHT on
 * top, so the model breaks ties and lifts records the rules under-rate; the
 * rules stay the deterministic baseline and the fallback when triage hasn't run.
 */

const JEV_WEIGHT = 3;

export type EventCategory = "medical" | "liability" | "coverage" | "legal" | "damages" | "client" | "admin";

export interface RankRule {
  id: string;
  test: RegExp;
  /** Optional: rule only applies to these kinds. */
  kinds?: CaseEvent["kind"][];
  weight: number;
  reason: string;
  category: EventCategory;
  /** Plain-English line safe for providers and clients. Null = firm-only fact. */
  plain: string | null;
  /** A milestone counts as "real movement" on the case. */
  milestone?: boolean;
  /** Happens once per case (a second record is the same fact, not a new milestone). */
  once?: boolean;
}

export const RANK_RULES: RankRule[] = [
  { id: "surgery-performed", test: /arthroscopy (was )?performed|arthroscopy, .*surgical center|post-operative: .*performed/i, weight: 10, reason: "Surgery", category: "medical", plain: "Surgery performed", milestone: true },
  { id: "surgery-recommended", test: /(recommends?|recommended) (a )?.*(arthroscopy|surgery)|second surgery recommended/i, weight: 9, reason: "Second surgery recommended", category: "medical", plain: "Further surgery recommended by the treating surgeon", milestone: true },
  { id: "scope", test: /scope of employment/i, weight: 9, reason: "Shifted liability", category: "liability", plain: null },
  { id: "coverage", once: true, test: /coverage confirmed|liability limits are|limits are \$|coverage position/i, weight: 9, reason: "Coverage confirmed", category: "coverage", plain: "Insurance coverage confirmed", milestone: true },
  { id: "specials", test: /specials tally/i, weight: 6, reason: "Specials tallied", category: "damages", plain: null },
  { id: "valuation", test: /case evaluation|valuation:/i, weight: 8, reason: "Valuation set", category: "damages", plain: null },
  { id: "accounts", test: /(three|different|inconsistent) accounts/i, weight: 8, reason: "Credibility risk", category: "liability", plain: null },
  { id: "suit", once: true, test: /summons (and|&)? ?complaint|suit (was )?commenced|action is now in discovery/i, weight: 8, reason: "Suit filed", category: "legal", plain: "Lawsuit filed", milestone: true },
  { id: "demand", once: true, test: /demand package (served|went out)|^demand package/i, weight: 8, reason: "Demand served", category: "legal", plain: "Settlement demand sent to the insurer", milestone: true },
  { id: "intake", once: true, test: /intake summary|initial client consultation/i, weight: 7, reason: "The client's first account", category: "client", plain: "Case opened with the firm", milestone: true },
  { id: "negotiation", once: true, test: /negotiations opened|opens negotiations/i, weight: 7, reason: "Negotiations opened", category: "legal", plain: "Insurer responded and negotiations began", milestone: true },
  { id: "prior-injury", test: /prior injur(y|ies) discrepancy|avulsion fracture/i, weight: 7, reason: "Prior-injury discrepancy", category: "liability", plain: null },
  { id: "tbi", test: /brain mri|traumatic brain injury/i, weight: 7, reason: "Head-injury imaging", category: "medical", plain: null },
  { id: "ime", test: /independent (medical|orthopaedic|neurological) exam|defence independent|ime\b.*attended|examinations attended/i, weight: 6, reason: "Defense medical exams", category: "legal", plain: "Medical exams requested by the other side completed", milestone: true },
  { id: "expert", test: /expert (disclosure|exchange)|radiolog\w* review/i, weight: 6, reason: "Defense expert served", category: "legal", plain: "Expert reports exchanged between the parties", milestone: true },
  { id: "discovery-dispute", test: /objected to|motion to compel|discovery is stuck/i, weight: 6, reason: "Discovery dispute", category: "legal", plain: "Discovery (exchange of evidence) is ongoing", milestone: true },
  { id: "no-fault", once: true, test: /no-fault (benefits )?exhausted|basic economic loss.*exhausted/i, weight: 6, reason: "No-fault exhausted", category: "coverage", plain: "First-party (no-fault) benefits used up", milestone: true },
  { id: "treatment-start", once: true, test: /treatment commenced|started treating/i, weight: 5, reason: "Treatment began", category: "medical", plain: "Treatment began", milestone: true },
  { id: "lien", test: /lien asserted|asserted a lien|medicaid lien/i, weight: 5, reason: "Lien asserted", category: "damages", plain: null },
  { id: "conference", test: /compliance conference/i, kinds: ["note", "calendar"], weight: 4, reason: "Court conference", category: "legal", plain: "Court conference held", milestone: true },
  { id: "records", test: /records received|records enclosed|file received/i, weight: 3, reason: "Records received", category: "medical", plain: "Medical records received by the firm" },
  { id: "chaser", test: /chaser|second request|third request|follow(ing)? up|check-in|checking in/i, weight: 1, reason: "Follow-up", category: "admin", plain: null },
];

export interface RankedEvent extends CaseEvent {
  score: number;
  reason: string | null;
  ruleId: string | null;
  category: EventCategory;
  plain: string | null;
  milestone: boolean;
  once: boolean;
  /** Same-fact records within a few days, collapsed under the strongest one. */
  related: string[];
}

const KIND_BONUS: Record<CaseEvent["kind"], number> = {
  note: 1,
  calendar: 0.6,
  email: 0.4,
  call: 0.3,
  task: 0.2,
  document: 0.5,
  expense: 0,
};

/** Chasers, notices and requests talk ABOUT an event; they are not the event. */
const LOGISTICS = /chaser|\brequest(s|ing)?\b|^re:|follow(ing)?[- ]up|check-in|checking in|notice:|scheduling|booking/i;
/** Structured records are judged by their title alone. */
const TITLE_ONLY: CaseEvent["kind"][] = ["task", "document", "expense"];

export function scoreEvent(e: CaseEvent): RankedEvent {
  const hay = TITLE_ONLY.includes(e.kind) ? e.title : `${e.title}\n${e.text}`;
  let best: (RankRule & { effective: number; inTitle: boolean }) | null = null;
  for (const rule of RANK_RULES) {
    if (rule.kinds && !rule.kinds.includes(e.kind)) continue;
    // Subject matches beat body matches: a body that merely mentions the
    // demand is not the demand.
    const inTitle = rule.test.test(e.title);
    if (!inTitle && !rule.test.test(hay)) continue;
    const effective = inTitle ? rule.weight : rule.weight - 4;
    // Ties go to the rule that matched the subject line.
    if (!best || effective > best.effective || (effective === best.effective && inTitle && !best.inTitle)) best = { ...rule, effective, inTitle };
  }
  if (LOGISTICS.test(e.title)) {
    const chaser = RANK_RULES.find((r) => r.id === "chaser")!;
    best = { ...chaser, effective: Math.min(best?.effective ?? 0, chaser.weight), inTitle: true };
  }
  return {
    ...e,
    score: Math.round(((best?.effective ?? 0) + KIND_BONUS[e.kind] + (e.jev?.importance ?? 0) * JEV_WEIGHT) * 100) / 100,
    reason: best?.reason ?? null,
    ruleId: best?.id ?? null,
    category: best?.category ?? "admin",
    plain: best?.plain ?? null,
    // A record that merely mentions a milestone in passing is not the milestone.
    milestone: Boolean(best?.milestone && best.inTitle),
    once: Boolean(best?.once),
    related: [],
  };
}

/**
 * Top-N past events, at most one per rule within a 30-day window (the email
 * and the file note about the same coverage letter are one story beat), then
 * returned in chronological order.
 */
export function rankTopEvents(events: RankedEvent[], today: string, n: number): RankedEvent[] {
  const past = events.filter((e) => e.date <= today && e.ruleId && e.ruleId !== "chaser");
  const sorted = [...past].sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
  const picked: RankedEvent[] = [];
  for (const e of sorted) {
    const twin = picked.find(
      (p) => p.ruleId === e.ruleId && Math.abs(Date.parse(p.date) - Date.parse(e.date)) <= 30 * 86_400_000,
    );
    if (twin) {
      twin.related.push(e.id);
      continue;
    }
    // Keep the highlight reel varied: no more than three beats per rule.
    if (picked.filter((p) => p.ruleId === e.ruleId).length >= 3) continue;
    picked.push({ ...e, related: [...e.related] });
    if (picked.length === n) break;
  }
  return picked.sort((a, b) => a.date.localeCompare(b.date));
}
