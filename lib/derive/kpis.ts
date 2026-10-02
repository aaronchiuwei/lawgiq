import type { MatterBundle, SourceRef } from "../clio/types";
import type { CaseEvent } from "./events";
import { allMoney, findField, parseMoney, type SourceFn } from "./util";

export interface Sourced<T> {
  value: T;
  source: SourceRef;
  /** Extra records that corroborate or explain the value. */
  also?: SourceRef[];
  /** For derived values: plain-English "how was this computed". */
  derivation?: string;
}

export interface PolicyLine {
  label: string;
  perPerson: number | null;
  perOccurrence: number | null;
  raw: string;
}

export interface Kpis {
  estimatedValue: (Sourced<number> & { rationale: string | null }) | null;
  coverage: {
    lines: PolicyLine[];
    defendantLimit: Sourced<number> | null;
    confirmed: boolean;
    confirmedBy: SourceRef | null;
    insurer: Sourced<string> | null;
    claimNumber: Sourced<string> | null;
    /** Derived: value minus the per-person defendant limit. Positive = exposure above coverage. */
    gap: Sourced<number> | null;
  };
  firmSpend: Sourced<number> & { count: number; items: { date: string; amount: number; label: string; source: SourceRef }[] };
  specials: (Sourced<number> & { interim: boolean; interimReason: SourceRef | null }) | null;
  wageLoss: Sourced<number> | null;
  liens: { holder: string; amount: number | null; source: SourceRef }[];
  noFault: { amount: number | null; exhausted: boolean; source: SourceRef } | null;
}

export function parsePolicyLines(text: string): PolicyLine[] {
  return text
    .split(/\n+/)
    .map((line): PolicyLine | null => {
      const m = line.match(/^(.+?):\s*(.+)$/);
      if (!m) return null;
      const amounts = allMoney(m[2]);
      return {
        label: m[1].trim(),
        perPerson: amounts[0] ?? null,
        perOccurrence: amounts[1] ?? null,
        raw: line.trim(),
      };
    })
    .filter((l): l is PolicyLine => l !== null && l.perPerson !== null);
}

export function deriveKpis(bundle: MatterBundle, events: CaseEvent[], source: SourceFn): Kpis {
  const valueField = findField(bundle, "Estimated Case Value");
  const rationale = findField(bundle, "Case Value Rationale");
  const limitsField = findField(bundle, "Policy Limits");
  const confirmedField = findField(bundle, "Policy Limits Confirmed");
  const insurerField = findField(bundle, "Insurance Carrier");
  const claimField = findField(bundle, "Claim Number");
  const specialsField = findField(bundle, "Medical Specials To Date");
  const wageField = findField(bundle, "Wage Loss Claimed");
  const lienField = findField(bundle, "Health Insurance or Lien Holder");

  const estimatedValue =
    valueField && typeof valueField.value === "number"
      ? {
          value: valueField.value,
          source: valueField.source,
          rationale: typeof rationale?.value === "string" ? rationale.value : null,
          also: rationale ? [rationale.source] : undefined,
        }
      : null;

  const lines = typeof limitsField?.value === "string" ? parsePolicyLines(limitsField.value) : [];
  const defendantLine =
    lines.find((l) => /defendant|liability|bodily/i.test(l.label)) ?? lines[0] ?? null;
  const confirmedBy =
    [...events]
      .reverse()
      .find((e) => /coverage confirmed|liability limits are|limits are \$/i.test(`${e.title} ${e.text}`))?.source ?? null;

  const defendantLimit =
    defendantLine && limitsField && defendantLine.perPerson !== null
      ? { value: defendantLine.perPerson, source: limitsField.source, also: confirmedBy ? [confirmedBy] : undefined }
      : null;

  const gap =
    estimatedValue && defendantLimit
      ? {
          value: estimatedValue.value - defendantLimit.value,
          source: estimatedValue.source,
          also: [defendantLimit.source],
          derivation: `Estimated case value minus the defendant's per-person limit (${defendantLine?.label}).`,
        }
      : null;

  const items = bundle.expenses.map((x) => ({
    date: x.date,
    amount: x.total,
    label: x.note.split("\n")[0].split(":")[0],
    source: source("expense", x.id, `Expense · ${x.note.split(":")[0]}`, { date: x.date, text: x.note }),
  }));
  const firmSpend = {
    value: items.reduce((s, i) => s + i.amount, 0),
    count: items.length,
    items,
    source: items[0]?.source ?? source("matter", bundle.matter.id, "Matter expenses"),
    also: items.slice(1).map((i) => i.source),
    derivation: `Sum of ${items.length} expense entries recorded on the matter in Clio.`,
  };

  // Specials: the custom field holds the figure; notes say whether it's final.
  const interimEvent = [...events]
    .sort((a, b) => Number(b.kind === "note") - Number(a.kind === "note") || b.date.localeCompare(a.date))
    .find(
      (e) =>
        /special/i.test(`${e.title} ${e.text}`) &&
        /interim|unreconciled|not been reconciled|still being reconciled|running (figure|total)|should not be quoted/i.test(e.text),
    );
  const specials =
    specialsField && typeof specialsField.value === "number"
      ? {
          value: specialsField.value,
          source: specialsField.source,
          interim: Boolean(interimEvent),
          interimReason: interimEvent?.source ?? null,
        }
      : null;

  const wageAmount = typeof wageField?.value === "string" ? parseMoney(wageField.value) : null;
  const wageLoss = wageField && wageAmount !== null ? { value: wageAmount, source: wageField.source } : null;

  const liens: Kpis["liens"] = [];
  let noFault: Kpis["noFault"] = null;
  if (lienField && typeof lienField.value === "string") {
    for (const sentence of lienField.value.split(/(?<=\.)\s+/)) {
      const lien = sentence.match(/^(.+?)\s+lien,?\s*\$?([\d,.]+)?/i);
      if (lien) liens.push({ holder: lien[1].trim(), amount: lien[2] ? parseMoney(lien[2]) : null, source: lienField.source });
      if (/no-fault/i.test(sentence)) {
        noFault = { amount: parseMoney(sentence), exhausted: /exhausted/i.test(sentence), source: lienField.source };
      }
    }
  }
  if (!noFault) {
    const nf = lines.find((l) => /no-fault/i.test(l.label));
    if (nf && limitsField) noFault = { amount: nf.perPerson, exhausted: false, source: limitsField.source };
  }

  return {
    estimatedValue,
    coverage: {
      lines,
      defendantLimit,
      confirmed: confirmedField?.value === true,
      confirmedBy,
      insurer: insurerField && typeof insurerField.value === "string" ? { value: insurerField.value, source: insurerField.source } : null,
      claimNumber: claimField && typeof claimField.value === "string" ? { value: claimField.value, source: claimField.source } : null,
      gap,
    },
    firmSpend,
    specials,
    wageLoss,
    liens,
    noFault,
  };
}
