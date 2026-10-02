import "server-only";
import { aiEnabled, AI_MODEL, generateAiDigest } from "../ai/digest";
import { getMatterSource, runExport, type MatterBundle } from "../clio";
import { DERIVE_DEFAULTS, resolveToday } from "../derive/config";
import { bundleHash, deriveCase, type CaseFile, type Digest } from "../derive";
import {
  getPhoto,
  getProviderVisibility,
  getSetting,
  listShares,
  readDigest,
  readPreviousOpen,
  readSnapshot,
  recordSyncError,
  touchOpen,
  writeDigest,
  writeSnapshot,
} from "../db";
import {
  selectClientView,
  selectFirmView,
  selectProviderDraft,
  selectProviderView,
  type ClientView,
  type FirmView,
  type Freshness,
  type ProviderDraft,
  type ProviderView,
} from "../access";

/**
 * The one server entry point the option pages use. Reads from our snapshot of
 * Clio (re-syncing when stale), derives the case file, and hands back only the
 * role-scoped view.
 */

/** Prototype has no auth; one attorney identity for last-opened tracking. */
export const DEMO_USER = "attorney-demo";

export function matterKey(): string {
  return `clio:${process.env.MATTER_ID ?? "default"}`;
}

export interface LoadedBundle {
  bundle: MatterBundle;
  syncError: { message: string; at: string } | null;
}

/**
 * Reads the pipeline's files under data/ on every call (they are small and
 * local). A forced sync first re-runs scripts/export_matter.py (Clio GET only).
 * If reading fails, the last good snapshot is served, marked stale.
 */
export async function loadBundle(opts: { force?: boolean } = {}): Promise<LoadedBundle> {
  const key = matterKey();
  try {
    if (opts.force) await runExport();
    const bundle = await getMatterSource().loadMatter();
    const snap = readSnapshot(key);
    const hash = bundleHash(bundle);
    if (!snap || snap.input_hash !== hash || snap.last_error) {
      writeSnapshot(key, bundle.origin, bundle.fetchedAt, hash, JSON.stringify(bundle));
    }
    return { bundle, syncError: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const snap = readSnapshot(key);
    if (!snap) throw err;
    recordSyncError(key, message);
    return { bundle: JSON.parse(snap.bundle_json) as MatterBundle, syncError: { message, at: new Date().toISOString() } };
  }
}

const inflight = new Map<string, Promise<void>>();
/** Bump when the rules digest's wording changes, so cached copies regenerate. */
const RULES_DIGEST_VERSION = "rules:v2";

/** Cached digest for this exact data; generates the AI one in the background once. */
function resolveDigest(c: CaseFile): Digest {
  const aiKey = `ai:${AI_MODEL}`;
  const cachedAi = readDigest(c.inputHash, aiKey);
  if (cachedAi) return JSON.parse(cachedAi) as Digest;

  if (aiEnabled() && !inflight.has(c.inputHash)) {
    inflight.set(
      c.inputHash,
      generateAiDigest(c)
        .then((d) => {
          if (d) writeDigest(c.inputHash, aiKey, JSON.stringify(d));
        })
        .catch((e) => console.error("AI digest failed:", e))
        .finally(() => inflight.delete(c.inputHash)),
    );
  }

  const cachedRules = readDigest(c.inputHash, RULES_DIGEST_VERSION);
  if (cachedRules) return JSON.parse(cachedRules) as Digest;
  writeDigest(c.inputHash, RULES_DIGEST_VERSION, JSON.stringify(c.digest));
  return c.digest;
}

export interface CaseContext {
  caseFile: CaseFile;
  freshness: Freshness;
  digestPending: boolean;
}

export async function getCaseContext(opts: { recordOpen?: boolean; forceSync?: boolean } = {}): Promise<CaseContext> {
  const { bundle, syncError } = await loadBundle({ force: opts.forceSync });
  const key = matterKey();
  const lastOpenedAt = opts.recordOpen ? touchOpen(DEMO_USER, key) : readPreviousOpen(DEMO_USER, key);
  const staleDays = Number(getSetting("clientContactStaleDays") ?? DERIVE_DEFAULTS.clientContactStaleDays);
  const gapDays = Number(getSetting("treatmentGapDays") ?? DERIVE_DEFAULTS.treatmentGapDays);

  const base = deriveCase(bundle, { today: resolveToday(), lastOpenedAt, clientContactStaleDays: staleDays, treatmentGapDays: gapDays });
  const digest = resolveDigest(base);
  const caseFile: CaseFile = { ...base, digest };
  return {
    caseFile,
    freshness: { origin: bundle.origin, fetchedAt: bundle.fetchedAt, syncError, itemCount: base.itemCount },
    digestPending: aiEnabled() && digest.generator.kind === "rules",
  };
}

export async function getFirmView(opts: { recordOpen?: boolean } = {}): Promise<FirmView & { digestPending: boolean }> {
  const { caseFile, freshness, digestPending } = await getCaseContext(opts);
  const key = matterKey();
  const providerDrafts = caseFile.providers
    .map((p) => selectProviderDraft(caseFile, p.id, getProviderVisibility(key, p.id)))
    .filter((d): d is ProviderDraft => Boolean(d));
  const shares = listShares(key).map((s) => ({
    id: s.id,
    providerId: s.provider_id,
    providerName: s.provider_name,
    sharedBy: s.shared_by,
    createdAt: s.created_at,
    itemCount: s.item_count,
    firstOpenedAt: s.first_opened_at,
    lastOpenedAt: s.last_opened_at,
    openCount: s.open_count,
    token: s.token,
  }));
  return { ...selectFirmView({ freshness, case: caseFile, photo: getPhoto(caseFile.client.id), shares, providerDrafts }), digestPending };
}

export async function getProviderView(providerId: string | undefined): Promise<ProviderView | null> {
  const { caseFile } = await getCaseContext();
  const id = providerId ?? caseFile.providers[0]?.id;
  if (!id) return null;
  return selectProviderView(caseFile, id, getProviderVisibility(matterKey(), id));
}

export async function getClientView(): Promise<ClientView> {
  const { caseFile } = await getCaseContext();
  return selectClientView(caseFile);
}

export async function listProviders(): Promise<{ id: string; name: string; shortName: string }[]> {
  const { caseFile } = await getCaseContext();
  return caseFile.providers.map((p) => ({ id: p.id, name: p.name, shortName: p.shortName }));
}
