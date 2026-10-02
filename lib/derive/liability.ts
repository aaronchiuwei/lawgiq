import type { MatterBundle, SourceRef } from "../clio/types";
import type { CaseEvent } from "./events";
import { findField, firstSentences, sentences, type SourceFn } from "./util";

/**
 * Liability snapshot: how it happened, who is adverse, the crux, and the
 * risks. Risks come from a lexicon of standard PI exposure patterns applied to
 * the file notes; each risk links to every note that raises it.
 */

export interface Risk {
  id: string;
  label: string;
  severity: 1 | 2 | 3;
  /** Credibility risks also feed the client-credibility score factor. */
  credibility: boolean;
  firstRaised: string;
  sources: SourceRef[];
  excerpt: string;
}

export interface Liability {
  mechanism: { text: string; source: SourceRef } | null;
  location: { text: string; source: SourceRef } | null;
  assessment: { text: string; source: SourceRef } | null;
  adverse: { name: string; role: string; source: SourceRef }[];
  crux: { question: string; text: string; source: SourceRef; resolved: boolean } | null;
  risks: Risk[];
}

export const RISK_LEXICON: { id: string; label: string; re: RegExp; severity: 1 | 2 | 3; credibility?: boolean }[] = [
  { id: "accounts", label: "Client has given inconsistent accounts of the mechanism", re: /(three|different|inconsistent) (different )?accounts/i, severity: 3, credibility: true },
  { id: "prior-injury", label: "Prior injury answered \"none\" but contradicted by records", re: /prior injur\w+[^.]*(contradict|discrepan)|answered "?none"? to prior|avulsion fracture/i, severity: 3, credibility: true },
  { id: "no-police-report", label: "No police accident report in the file", re: /no police (accident )?report/i, severity: 2 },
  { id: "photos", label: "Scene photographs never obtained from the client", re: /photographs[^.]*(nobody has asked|obtained none|not obtained)/i, severity: 1 },
  { id: "developmental", label: "Developmental (non-traumatic) finding in the surgical MRI", re: /developmental/i, severity: 2 },
  { id: "ct-clean", label: "Day-after CT scans were clean; head injury rests on later imaging", re: /ct[^.]*(both )?(negative|clean)/i, severity: 2 },
  { id: "wage-proof", label: "Wage loss rests on a single 1099 with no expert", re: /single (2022 )?1099|1099 (alone|from 2022)|rests on one document/i, severity: 2 },
  { id: "pmh-refused", label: "Client declined to give medical history at defence exams", re: /(refused|declin\w+) to (provide|give) (a )?past medical history/i, severity: 2, credibility: true },
  { id: "defences", label: "Comparative negligence and seatbelt defences anticipated", re: /comparative negligence/i, severity: 1 },
];

export function deriveLiability(bundle: MatterBundle, events: CaseEvent[], source: SourceFn): Liability {
  const notes = events.filter((e) => e.kind === "note");

  const mechNote = notes.find((n) => /mechanism/i.test(n.text));
  const mechText = mechNote?.text.match(/mechanism[^:]*:\s*([^]+?)(?:\n\n|$)/i)?.[1];
  const mechFirst = mechText ? firstSentences(mechText, 2) : "";
  const mechanism = mechNote && mechText ? { text: mechFirst.charAt(0).toUpperCase() + mechFirst.slice(1), source: mechNote.source } : null;

  const loc = findField(bundle, "Accident Location");
  const assessment = findField(bundle, "Liability Assessment");

  const byId = new Map(bundle.contacts.map((c) => [c.id, c]));
  const adverse = bundle.relationships
    .filter((r) => /adverse|defendant/i.test(r.description))
    .map((r) => ({
      name: byId.get(r.contactId)?.name ?? "Unknown",
      role: r.description,
      source: source("relationship", r.id, `Relationship · ${byId.get(r.contactId)?.name ?? ""}`, { text: r.description }),
    }));

  // The crux: the note that says what the case turns on.
  const CRUX = /whole case|everything about the value|the case turns on|\bcrux\b/i;
  const cruxNote = [...notes].reverse().find((n) => CRUX.test(`${n.title} ${n.text}`));
  let crux: Liability["crux"] = null;
  if (cruxNote) {
    const para = cruxNote.text.split(/\n\n/).find((p) => CRUX.test(p)) ?? cruxNote.text;
    const named = `${para} ${cruxNote.title}`.match(/(?:^|[.,:]\s*)([a-z][a-z ]{2,40}?),?\s+(?:and this )?is the whole case/i)?.[1];
    const ifs = sentences(para).filter((sn) => /^if\b/i.test(sn));
    crux = {
      question: named ? named.charAt(0).toUpperCase() + named.slice(1) : cruxNote.title,
      text: ifs.length ? ifs.slice(0, 2).join(" ") : firstSentences(para, 2),
      source: cruxNote.source,
      resolved: false,
    };
  }

  const risks: Risk[] = [];
  for (const r of RISK_LEXICON) {
    const hits = notes.filter((n) => r.re.test(n.text) || r.re.test(n.title));
    if (!hits.length) continue;
    const firstHit = hits[0];
    const sentence = firstHit.text.split(/(?<=[.:])\s+/).find((s) => r.re.test(s)) ?? firstHit.title;
    risks.push({
      id: r.id,
      label: r.label,
      severity: r.severity,
      credibility: Boolean(r.credibility),
      firstRaised: firstHit.date,
      sources: hits.map((h) => h.source),
      excerpt: sentence.trim(),
    });
  }
  risks.sort((a, b) => b.severity - a.severity || a.firstRaised.localeCompare(b.firstRaised));

  return {
    mechanism,
    location: loc && typeof loc.value === "string" ? { text: loc.value, source: loc.source } : null,
    assessment: assessment && typeof assessment.value === "string" ? { text: assessment.value, source: assessment.source } : null,
    adverse,
    crux,
    risks,
  };
}
