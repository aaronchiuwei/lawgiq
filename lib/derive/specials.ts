import type { SourceRef } from "../clio/types";
import type { CaseEvent } from "./events";
import { providersMentioned, type Provider } from "./providers";
import { parseMoney } from "./util";

/**
 * Medical specials by provider, parsed from the most recent itemised tally in
 * the file notes ("- Chiropractic, Advanced Rockland, 96 visits: $17,400.00").
 */

export interface SpecialsLine {
  label: string;
  detail: string | null;
  amount: number;
  providerId: string | null;
}

export interface SpecialsBreakdown {
  lines: SpecialsLine[];
  total: number;
  source: SourceRef;
  asOf: string;
  /** "eight of the ten providers" → { reported: 8, of: 10 } */
  coverage: { reported: number; of: number } | null;
  /** Lines the note flags as uncertain (ledgers not reconciled). */
  uncertainLabels: string[];
}

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const num = (s: string) => WORD_NUM[s.toLowerCase()] ?? Number(s);

export function deriveSpecials(events: CaseEvent[], providers: Provider[]): SpecialsBreakdown | null {
  const candidates = events
    .filter((e) => e.kind === "note" && /special/i.test(`${e.title} ${e.text}`))
    .map((e) => ({ e, lines: [...e.text.matchAll(/^-\s*(.+?):\s*(\$[\d,]+(?:\.\d+)?)\s*$/gm)] }))
    .filter((c) => c.lines.length >= 3)
    .sort((a, b) => b.e.date.localeCompare(a.e.date));
  const pick = candidates[0];
  if (!pick) return null;

  const lines: SpecialsLine[] = pick.lines.map((m) => {
    const [head, ...rest] = m[1].split(/,\s*/);
    return {
      label: head.trim(),
      detail: rest.length ? rest.join(", ").trim() : null,
      amount: parseMoney(m[2]) ?? 0,
      providerId: providersMentioned(m[1], providers)[0] ?? null,
    };
  });

  const cov = pick.e.text.match(/(\w+) of the (\w+) providers/i);
  // Lines named in a sentence about reconciliation are the uncertain ones.
  const uncertainSentence = (pick.e.text.split(/(?<=\.)\s+|\n+/).find((s) => /reconcil/i.test(s)) ?? "")
    .replace(/\bPT\b/g, "physical therapy")
    .replace(/\bER\b/g, "emergency");
  const uncertainLabels = lines
    .filter((l) => l.label.split(/\s+/).some((w) => w.length > 4 && uncertainSentence.toLowerCase().includes(w.toLowerCase().slice(0, 6))))
    .map((l) => l.label);

  return {
    lines: lines.sort((a, b) => b.amount - a.amount),
    total: lines.reduce((s, l) => s + l.amount, 0),
    source: pick.e.source,
    asOf: pick.e.date,
    coverage: cov ? { reported: num(cov[1]), of: num(cov[2]) } : null,
    uncertainLabels,
  };
}
