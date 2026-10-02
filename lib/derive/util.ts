import { clioDeepLink } from "../clio/links";
import type { MatterBundle, SourceKind, SourceRef } from "../clio/types";

export const DAY_MS = 86_400_000;

/** YYYY-MM-DD for any ISO string or Date. */
export function isoDay(v: string | Date): string {
  if (typeof v === "string") return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(isoDay(b)) - Date.parse(isoDay(a))) / DAY_MS);
}

export function addDays(day: string, n: number): string {
  return isoDay(new Date(Date.parse(isoDay(day)) + n * DAY_MS));
}

/** "$100,000" / "$22,180.00" / "100000" → number. */
export function parseMoney(s: string): number | null {
  const m = s.match(/\$?\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function allMoney(s: string): number[] {
  return [...s.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, "")));
}

const ABBREV = /\b(a\.m|p\.m|Dr|Mr|Mrs|Ms|St|No|vs|Inc|Co)\./g;

export function sentences(text: string): string[] {
  const protectedText = text.replace(/\s+/g, " ").trim().replace(ABBREV, (m) => m.replace(/\./g, "\u2024"));
  const parts = protectedText.match(/[^.!?]+[.!?]+["”’)]?(\s|$)|[^.!?]+$/g) ?? [protectedText];
  return parts.map((p) => p.replace(/\u2024/g, ".").trim()).filter(Boolean);
}

export function firstSentences(text: string, n = 1): string {
  return sentences(text).slice(0, n).join(" ");
}

export function snippet(text: string, max = 220): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const STOP = new Set(
  "a an the and or of to in on at for with by from as is are was were be been this that these those it its his her their our we you he she they not no has have had will would can could should may might into than then there here about after before over under up out per via re fw fwd".split(
    " ",
  ),
);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

/** Builds SourceRefs for any record in the bundle, with a Clio deep link in live mode. */
export function sourceFactory(bundle: MatterBundle) {
  const live = bundle.origin === "clio";
  // Documents carry their page count so the source drawer can page through the embedded PDF.
  const pageCounts = new Map(bundle.documents.map((d) => [d.id, d.pageCount]));
  return function source(
    kind: SourceKind,
    id: string,
    label: string,
    opts: { date?: string; text?: string; page?: number } = {},
  ): SourceRef {
    const pageCount = kind === "document" ? pageCounts.get(id) : undefined;
    return {
      kind,
      id,
      label,
      date: opts.date ? isoDay(opts.date) : undefined,
      snippet: opts.text ? snippet(opts.text) : undefined,
      body: opts.text,
      clioUrl: live ? clioDeepLink(kind, id, bundle.matter.id) : null,
      ...(pageCount ? { pageCount } : {}),
      ...(kind === "document" && opts.page ? { page: opts.page } : {}),
    };
  };
}

export type SourceFn = ReturnType<typeof sourceFactory>;

export function findField(bundle: MatterBundle, name: string) {
  const n = name.toLowerCase();
  return bundle.customFields.find((f) => f.name.toLowerCase() === n) ?? null;
}

export function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (c) => c.toUpperCase());
}
