/**
 * Tunable thresholds. These are surfaced in the UI next to the values they
 * drive, so an attorney can see (and change) why something was flagged.
 */
export const DERIVE_DEFAULTS = {
  /** Flag the client relationship when the last contact is older than this. */
  clientContactStaleDays: 30,
  /** A gap between documented visits longer than this is a treatment gap. */
  treatmentGapDays: 45,
  /** How far back "what changed" looks on a first visit (no last-opened yet). */
  firstVisitLookbackDays: 14,
  /** Timeline highlight size. */
  topEvents: 10,
} as const;

export type DeriveOptions = {
  /** "Today" for all relative maths. DATASET_TODAY pins it for demos and tests. */
  today: string;
  /** Previous open of this matter by this user (our DB), or null on a first visit. */
  lastOpenedAt: string | null;
  clientContactStaleDays: number;
  treatmentGapDays: number;
};

export function resolveToday(): string {
  return process.env.DATASET_TODAY ?? new Date().toISOString().slice(0, 10);
}
