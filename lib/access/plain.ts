/**
 * Plain-English copy for non-lawyers. This is product copy about what each
 * stage of a personal-injury case means in general, not facts about any case.
 */
export const STAGE_EXPLAINERS: Record<string, { client: string; provider: string }> = {
  intake: {
    client: "We're gathering the facts of what happened and the paperwork we need to represent you.",
    provider: "The firm has taken the case and is gathering records.",
  },
  treatment: {
    client: "Your job right now is to get better. We collect your medical records and bills as you go.",
    provider: "The patient is treating; the firm is collecting records and bills.",
  },
  demand: {
    client: "We send the insurance company a package showing your injuries and costs, and ask them to pay.",
    provider: "The firm has sent, or is preparing, a settlement demand.",
  },
  negotiation: {
    client: "We go back and forth with the insurance company to reach a fair settlement.",
    provider: "The firm is negotiating with the insurer.",
  },
  litigation: {
    client: "We've filed a lawsuit. Both sides exchange information, which takes time. Most cases still settle before trial.",
    provider: "A lawsuit is on file. The case is active and moving through the court process.",
  },
  trial: {
    client: "The case is being prepared for, or is in, trial.",
    provider: "The case is at the trial stage.",
  },
  disbursement: {
    client: "The case has resolved. We pay medical bills and liens, then send you your share.",
    provider: "The case has resolved. Liens and bills are being paid from the recovery.",
  },
  closed: {
    client: "Your case is complete.",
    provider: "The case is closed.",
  },
};

export function explainStage(stage: string | null, audience: "client" | "provider"): string | null {
  if (!stage) return null;
  return STAGE_EXPLAINERS[stage.toLowerCase()]?.[audience] ?? null;
}

/** Calendar summaries rewritten for the client. */
export function plainAppointment(summary: string): string {
  const s = summary.trim();
  let m = s.match(/^client treatment:\s*(.+)$/i);
  if (m) return m[1].replace(/\s*\(following week\)/i, "").replace(/^./, (c) => c.toUpperCase());
  m = s.match(/^client appointment:\s*(.+)$/i);
  if (m) return `Meeting with your legal team: ${m[1]}`;
  if (/call with client/i.test(s)) return "Phone call with your legal team";
  if (/\bime\b|independent medical/i.test(s)) return "Medical examination requested by the other side";
  return s;
}

/** Firm task names rewritten as something the client is asked to do. */
export function plainAsk(taskName: string): string | null {
  const m = taskName.match(/^(?:obtain|collect|get)\s+(.+?)\s+from client$/i);
  if (m) return `Send us your ${m[1]}`;
  return null;
}

/**
 * "What usually happens next" for a client, keyed by the CURRENT stage. It
 * describes the common path without predicting this case's outcome.
 */
export const STAGE_NEXT_FOR_CLIENT: Record<string, string> = {
  intake: "Next, you start or keep up your treatment while we request records and contact the insurance company.",
  treatment: "Once your doctors have a clear picture of your recovery, we put together a demand for the insurance company.",
  demand: "The insurance company reviews our demand and usually answers with an offer we can negotiate.",
  negotiation: "We keep negotiating. If we can't reach a fair number, filing a lawsuit is the next option.",
  litigation: "Most cases settle during this stage. If yours doesn't, the court sets a trial date and we'll prepare you well ahead of it.",
  trial: "After trial the court decides, and we explain the result and any next steps with you.",
  disbursement: "We pay the bills and liens from the recovery, then send you your share with a full breakdown.",
  closed: "Nothing more is needed from you.",
};

export function nextStepForClient(stage: string | null): string | null {
  if (!stage) return null;
  return STAGE_NEXT_FOR_CLIENT[stage.toLowerCase()] ?? null;
}
