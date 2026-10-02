import type { Contact, MatterBundle, SourceRef } from "../clio/types";
import type { SourceFn } from "./util";

/**
 * Medical providers on the matter, read from Clio relationships. A person
 * contact whose company is a provider (a treating doctor at a practice) is
 * folded into that provider so "Dr. Capiola" and "McCulloch" are one entity.
 */

export interface Provider {
  id: string;
  name: string;
  /** Short display name, e.g. "McCulloch Orthopaedic". */
  shortName: string;
  /** From the relationship description, e.g. "Orthopaedic surgery". */
  specialty: string;
  /** Lowercase strings that identify this provider in free text. */
  aliases: string[];
  /** Specialty words used to attribute generic mentions ("physical therapy"). */
  specialtyTerms: string[];
  clinicians: string[];
  email: string | null;
  source: SourceRef;
}

const PROVIDER_REL = /\b(treating|hospital|provider|clinic|physician|surgeon|therap|chiropract)/i;
const NON_PROVIDER = /\b(adverse|carrier|insur|claims|administrator|defendant|counsel)/i;

// Words too generic to identify a practice on their own.
const GENERIC = new Set(
  "advanced offices office p.c. pc pllc llc inc services service surgical surgery orthopaedic orthopedic chiropractic physical therapy hospital medical center centre of new york the and group associates practice care health".split(
    " ",
  ),
);

const SPECIALTY_TERMS: [RegExp, string[]][] = [
  [/chiropract/i, ["chiropract"]],
  [/physical therap/i, ["physical therapy", " pt ", "therapy session"]],
  [/orthop/i, ["orthop"]],
  [/emergency|hospital/i, ["emergency", " er ", "ct head"]],
  [/imaging|radiolog/i, ["mri", "imaging", "x-ray"]],
];

function distinctiveTokens(name: string): string[] {
  const words = name.replace(/[,.]/g, " ").split(/\s+/).filter(Boolean);
  // "Advanced Rockland ..." is only distinctive as a phrase: "Rockland" alone
  // also matches unrelated practices in the same county.
  if (words.length > 1 && GENERIC.has(words[0].toLowerCase())) return [`${words[0]} ${words[1]}`.toLowerCase()];
  return words.map((t) => t.toLowerCase()).filter((t) => t.length > 3 && !GENERIC.has(t));
}

function specialtyOf(description: string): string {
  const afterComma = description.split(",").slice(1).join(",").trim() || description;
  return afterComma
    .replace(/\(.*?\)/g, "")
    .replace(/\bDOI\s*\+\s*\d+\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

const domainOf = (c: Contact) => c.emails[0]?.address.split("@")[1]?.toLowerCase() ?? null;

/** The company a person works at: Clio's company field, else a company contact sharing their email domain. */
function employerOf(person: Contact, contacts: Contact[]): string | null {
  if (person.company) return person.company;
  const domain = domainOf(person);
  if (!domain) return null;
  return contacts.find((c) => c.type === "Company" && domainOf(c) === domain)?.name ?? null;
}

export function deriveProviders(bundle: MatterBundle, source: SourceFn): Provider[] {
  const byId = new Map(bundle.contacts.map((c) => [c.id, c]));
  const employer = new Map(bundle.contacts.map((c) => [c.id, c.type === "Person" ? employerOf(c, bundle.contacts) : null]));
  const providers: Provider[] = [];

  for (const rel of bundle.relationships) {
    if (!PROVIDER_REL.test(rel.description) || NON_PROVIDER.test(rel.description)) continue;
    const contact = byId.get(rel.contactId);
    if (!contact) continue;
    // A person who works at a provider company is a clinician, not a provider.
    if (contact.type === "Person" && employer.get(contact.id)) {
      const parent = bundle.contacts.find((c) => c.type === "Company" && c.name === employer.get(contact.id));
      if (parent && bundle.relationships.some((r) => r.contactId === parent.id)) continue;
    }

    const clinicians = bundle.contacts
      .filter((c) => c.type === "Person" && employer.get(c.id) === contact.name)
      .map((c) => [c.title, c.firstName, c.lastName].filter(Boolean).join(" "));
    const parenthetical = [...rel.description.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].replace(/,.*$/, "").trim());
    const lastNames = [
      ...bundle.contacts.filter((c) => c.type === "Person" && employer.get(c.id) === contact.name).map((c) => c.lastName ?? ""),
      ...parenthetical.map((p) => p.split(/\s+/).pop() ?? ""),
    ].filter((n) => n.length > 2);

    const tokens = distinctiveTokens(contact.name);
    const specialty = specialtyOf(rel.description);
    const specialtyTerms = SPECIALTY_TERMS.filter(([re]) => re.test(rel.description)).flatMap(([, t]) => t);
    const shortName = contact.name
      .replace(/,?\s*(P\.C\.|PLLC|LLC|Inc\.?)$/i, "")
      .replace(/\s+(Offices|Surgical Services|of New York)$/i, "")
      .trim();

    providers.push({
      id: contact.id,
      name: contact.name,
      shortName,
      specialty,
      aliases: [...new Set([...tokens, ...lastNames.map((n) => n.toLowerCase())])],
      specialtyTerms,
      clinicians: [...clinicians, ...parenthetical.filter((p) => !clinicians.some((c) => c.includes(p.split(" ").pop() ?? "")))],
      email: contact.emails[0]?.address ?? null,
      source: source("relationship", rel.id, `Relationship · ${contact.name}`, { text: rel.description }),
    });
  }
  return providers;
}

/** Which providers does a piece of free text name? */
export function providersMentioned(text: string, providers: Provider[]): string[] {
  const t = ` ${text.toLowerCase()} `;
  return providers.filter((p) => p.aliases.some((a) => t.includes(a))).map((p) => p.id);
}

/** Like providersMentioned, but also attributes generic specialty mentions. */
export function providersImplied(text: string, providers: Provider[]): string[] {
  const named = providersMentioned(text, providers);
  if (named.length) return named;
  const t = ` ${text.toLowerCase()} `;
  return providers.filter((p) => p.specialtyTerms.some((s) => t.includes(s))).map((p) => p.id);
}
