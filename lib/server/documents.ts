import "server-only";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readShare } from "../db";
import { getClientView, getProviderView } from "./case";

/**
 * Serves the Clio documents the pipeline downloaded (data/raw, from ocr_pipeline.py via
 * GET /documents/{id}/download) and their OCR pages (data/ocr), scoped by who is asking.
 *
 * The firm view may open any document on the matter. A provider, the client, or a
 * shared link may only open documents their own role-scoped view already cites, so the
 * embedded viewer can never widen what lib/access released.
 */

const DATA_DIR = process.env.PIPELINE_DATA_DIR ?? path.join(process.cwd(), "data");
const ID = /^\d{1,20}$/;

export type DocumentScope =
  | { role: "firm" }
  | { role: "provider"; providerId: string }
  | { role: "client" }
  | { role: "share"; token: string };

export function scopeFromSearch(params: URLSearchParams): DocumentScope {
  const share = params.get("share");
  if (share) return { role: "share", token: share };
  const role = params.get("role");
  if (role === "provider") return { role: "provider", providerId: params.get("provider") ?? "" };
  if (role === "client") return { role: "client" };
  return { role: "firm" };
}

/** Every document id a role-scoped payload cites, found by walking it for document SourceRefs. */
function citedDocumentIds(payload: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(payload)) {
    for (const v of payload) citedDocumentIds(v, out);
  } else if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    if (o.kind === "document" && typeof o.id === "string") out.add(o.id);
    for (const v of Object.values(o)) citedDocumentIds(v, out);
  }
  return out;
}

export async function canOpenDocument(id: string, scope: DocumentScope): Promise<boolean> {
  if (!ID.test(id)) return false;
  switch (scope.role) {
    case "firm":
      return true;
    case "provider": {
      const view = scope.providerId ? await getProviderView(scope.providerId) : null;
      return Boolean(view && citedDocumentIds(view).has(id));
    }
    case "client":
      return citedDocumentIds(await getClientView()).has(id);
    case "share": {
      const share = readShare(scope.token);
      return Boolean(share && citedDocumentIds(JSON.parse(share.payload_json)).has(id));
    }
  }
}

export async function readDocumentPdf(id: string): Promise<Buffer | null> {
  const file = path.join(DATA_DIR, "raw", `${id}.pdf`);
  return ID.test(id) && existsSync(file) ? readFile(file) : null;
}

export interface DocumentPage {
  page: number;
  text: string;
  method: string;
  charCount: number;
}

export async function readDocumentPages(id: string): Promise<DocumentPage[] | null> {
  const file = path.join(DATA_DIR, "ocr", `${id}.json`);
  if (!ID.test(id) || !existsSync(file)) return null;
  const doc = JSON.parse(await readFile(file, "utf8")) as { pages: { page: number; text: string; method: string; char_count: number }[] };
  return doc.pages.map((p) => ({ page: p.page, text: p.text, method: p.method, charCount: p.char_count }));
}
