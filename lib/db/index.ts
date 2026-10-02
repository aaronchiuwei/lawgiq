import Database from "better-sqlite3";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Our own store. Clio is read-only to us, so everything we need to remember
 * lives here: the last synced snapshot, cached digests, per-user last-opened
 * timestamps, provider visibility settings, the sharing log with open
 * tracking, and client photos.
 */

const DB_PATH = process.env.LAWGIQ_DB_PATH ?? path.join(process.cwd(), "data", "lawgiq.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      matter_key TEXT PRIMARY KEY,
      origin TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      bundle_json TEXT NOT NULL,
      last_error TEXT,
      last_error_at TEXT
    );
    CREATE TABLE IF NOT EXISTS digests (
      input_hash TEXT NOT NULL,
      generator TEXT NOT NULL,
      created_at TEXT NOT NULL,
      digest_json TEXT NOT NULL,
      PRIMARY KEY (input_hash, generator)
    );
    CREATE TABLE IF NOT EXISTS user_opens (
      user_id TEXT NOT NULL,
      matter_key TEXT NOT NULL,
      last_opened_at TEXT NOT NULL,
      previous_opened_at TEXT,
      PRIMARY KEY (user_id, matter_key)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS provider_settings (
      matter_key TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      show_coverage_amount INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (matter_key, provider_id)
    );
    CREATE TABLE IF NOT EXISTS provider_item_visibility (
      matter_key TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      included INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (matter_key, provider_id, item_key)
    );
    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      matter_key TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      shared_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      item_count INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      first_opened_at TEXT,
      last_opened_at TEXT,
      open_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS contact_photos (
      contact_id TEXT PRIMARY KEY,
      data_url TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

/* ---------- snapshots ---------- */

export interface SnapshotRow {
  matter_key: string;
  origin: string;
  fetched_at: string;
  input_hash: string;
  bundle_json: string;
  last_error: string | null;
  last_error_at: string | null;
}

export function readSnapshot(matterKey: string): SnapshotRow | null {
  return (getDb().prepare("SELECT * FROM snapshots WHERE matter_key = ?").get(matterKey) as SnapshotRow | undefined) ?? null;
}

export function writeSnapshot(matterKey: string, origin: string, fetchedAt: string, inputHash: string, bundleJson: string) {
  getDb()
    .prepare(
      `INSERT INTO snapshots (matter_key, origin, fetched_at, input_hash, bundle_json, last_error, last_error_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL)
       ON CONFLICT(matter_key) DO UPDATE SET origin=excluded.origin, fetched_at=excluded.fetched_at,
         input_hash=excluded.input_hash, bundle_json=excluded.bundle_json, last_error=NULL, last_error_at=NULL`,
    )
    .run(matterKey, origin, fetchedAt, inputHash, bundleJson);
}

export function recordSyncError(matterKey: string, message: string) {
  getDb().prepare("UPDATE snapshots SET last_error = ?, last_error_at = ? WHERE matter_key = ?").run(message, new Date().toISOString(), matterKey);
}

/* ---------- digests ---------- */

export function readDigest(inputHash: string, generator: string): string | null {
  const row = getDb().prepare("SELECT digest_json FROM digests WHERE input_hash = ? AND generator = ?").get(inputHash, generator) as
    | { digest_json: string }
    | undefined;
  return row?.digest_json ?? null;
}

export function writeDigest(inputHash: string, generator: string, json: string) {
  getDb()
    .prepare("INSERT OR REPLACE INTO digests (input_hash, generator, created_at, digest_json) VALUES (?, ?, ?, ?)")
    .run(inputHash, generator, new Date().toISOString(), json);
}

/* ---------- last opened ---------- */

/** Opens within this window are one visit: re-renders don't reset "what changed". */
const VISIT_WINDOW_MS = 30 * 60 * 1000;

/**
 * Records an open and returns the PREVIOUS visit's timestamp (what "since you
 * last opened it" compares against).
 */
export function touchOpen(userId: string, matterKey: string): string | null {
  const d = getDb();
  const row = d.prepare("SELECT last_opened_at, previous_opened_at FROM user_opens WHERE user_id = ? AND matter_key = ?").get(userId, matterKey) as
    | { last_opened_at: string; previous_opened_at: string | null }
    | undefined;
  const now = new Date();
  if (row && now.getTime() - Date.parse(row.last_opened_at) < VISIT_WINDOW_MS) {
    d.prepare("UPDATE user_opens SET last_opened_at = ? WHERE user_id = ? AND matter_key = ?").run(now.toISOString(), userId, matterKey);
    return row.previous_opened_at;
  }
  d.prepare(
    `INSERT INTO user_opens (user_id, matter_key, last_opened_at, previous_opened_at) VALUES (?, ?, ?, NULL)
     ON CONFLICT(user_id, matter_key) DO UPDATE SET previous_opened_at = user_opens.last_opened_at, last_opened_at = excluded.last_opened_at`,
  ).run(userId, matterKey, now.toISOString());
  return row?.last_opened_at ?? null;
}

/** Reads the previous open without recording a new one (for re-renders within a visit). */
export function readPreviousOpen(userId: string, matterKey: string): string | null {
  const row = getDb().prepare("SELECT previous_opened_at FROM user_opens WHERE user_id = ? AND matter_key = ?").get(userId, matterKey) as
    | { previous_opened_at: string | null }
    | undefined;
  return row?.previous_opened_at ?? null;
}

export function setPreviousOpen(userId: string, matterKey: string, iso: string | null) {
  getDb()
    .prepare(
      `INSERT INTO user_opens (user_id, matter_key, last_opened_at, previous_opened_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, matter_key) DO UPDATE SET previous_opened_at = excluded.previous_opened_at`,
    )
    .run(userId, matterKey, new Date().toISOString(), iso);
}

/* ---------- settings ---------- */

export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

/* ---------- provider visibility ---------- */

export interface ProviderVisibility {
  showCoverageAmount: boolean;
  /** item_key → included. Missing keys use the item's default. */
  items: Record<string, boolean>;
}

export function getProviderVisibility(matterKey: string, providerId: string): ProviderVisibility {
  const d = getDb();
  const s = d.prepare("SELECT show_coverage_amount FROM provider_settings WHERE matter_key = ? AND provider_id = ?").get(matterKey, providerId) as
    | { show_coverage_amount: number }
    | undefined;
  const rows = d
    .prepare("SELECT item_key, included FROM provider_item_visibility WHERE matter_key = ? AND provider_id = ?")
    .all(matterKey, providerId) as { item_key: string; included: number }[];
  return {
    showCoverageAmount: Boolean(s?.show_coverage_amount),
    items: Object.fromEntries(rows.map((r) => [r.item_key, Boolean(r.included)])),
  };
}

export function setCoverageAmountVisible(matterKey: string, providerId: string, show: boolean) {
  getDb()
    .prepare(
      `INSERT INTO provider_settings (matter_key, provider_id, show_coverage_amount) VALUES (?, ?, ?)
       ON CONFLICT(matter_key, provider_id) DO UPDATE SET show_coverage_amount = excluded.show_coverage_amount`,
    )
    .run(matterKey, providerId, show ? 1 : 0);
}

export function setItemVisible(matterKey: string, providerId: string, itemKey: string, included: boolean) {
  getDb()
    .prepare(
      `INSERT INTO provider_item_visibility (matter_key, provider_id, item_key, included, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(matter_key, provider_id, item_key) DO UPDATE SET included = excluded.included, updated_at = excluded.updated_at`,
    )
    .run(matterKey, providerId, itemKey, included ? 1 : 0, new Date().toISOString());
}

/* ---------- sharing log ---------- */

export interface ShareRow {
  id: string;
  token: string;
  matter_key: string;
  provider_id: string;
  provider_name: string;
  shared_by: string;
  created_at: string;
  item_count: number;
  payload_json: string;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
}

export function createShare(input: {
  matterKey: string;
  providerId: string;
  providerName: string;
  sharedBy: string;
  itemCount: number;
  payloadJson: string;
}): ShareRow {
  const row: ShareRow = {
    id: randomUUID(),
    token: randomBytes(18).toString("base64url"),
    matter_key: input.matterKey,
    provider_id: input.providerId,
    provider_name: input.providerName,
    shared_by: input.sharedBy,
    created_at: new Date().toISOString(),
    item_count: input.itemCount,
    payload_json: input.payloadJson,
    first_opened_at: null,
    last_opened_at: null,
    open_count: 0,
  };
  getDb()
    .prepare(
      `INSERT INTO shares (id, token, matter_key, provider_id, provider_name, shared_by, created_at, item_count, payload_json, open_count)
       VALUES (@id, @token, @matter_key, @provider_id, @provider_name, @shared_by, @created_at, @item_count, @payload_json, 0)`,
    )
    .run(row);
  return row;
}

export function listShares(matterKey: string): Omit<ShareRow, "payload_json">[] {
  return getDb()
    .prepare(
      `SELECT id, token, matter_key, provider_id, provider_name, shared_by, created_at, item_count, first_opened_at, last_opened_at, open_count
       FROM shares WHERE matter_key = ? ORDER BY created_at DESC`,
    )
    .all(matterKey) as Omit<ShareRow, "payload_json">[];
}

/** Provider opened a shared link: record it and return the snapshot they were sent. */
/** Reads a share without counting it as an open (for checking what a shared link may load). */
export function readShare(token: string): ShareRow | null {
  return (getDb().prepare("SELECT * FROM shares WHERE token = ?").get(token) as ShareRow | undefined) ?? null;
}

export function openShare(token: string): ShareRow | null {
  const d = getDb();
  const row = d.prepare("SELECT * FROM shares WHERE token = ?").get(token) as ShareRow | undefined;
  if (!row) return null;
  const now = new Date().toISOString();
  d.prepare("UPDATE shares SET open_count = open_count + 1, last_opened_at = ?, first_opened_at = COALESCE(first_opened_at, ?) WHERE token = ?").run(
    now,
    now,
    token,
  );
  return { ...row, open_count: row.open_count + 1, last_opened_at: now, first_opened_at: row.first_opened_at ?? now };
}

/* ---------- client photos ---------- */

export function getPhoto(contactId: string): string | null {
  const row = getDb().prepare("SELECT data_url FROM contact_photos WHERE contact_id = ?").get(contactId) as { data_url: string } | undefined;
  return row?.data_url ?? null;
}

export function setPhoto(contactId: string, dataUrl: string) {
  getDb()
    .prepare("INSERT OR REPLACE INTO contact_photos (contact_id, data_url, updated_at) VALUES (?, ?, ?)")
    .run(contactId, dataUrl, new Date().toISOString());
}

export function deletePhoto(contactId: string) {
  getDb().prepare("DELETE FROM contact_photos WHERE contact_id = ?").run(contactId);
}
