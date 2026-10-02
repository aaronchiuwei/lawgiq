import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { normaliseExport, type ClioExport } from "./normalise";
import type { MatterBundle, MatterSource, TaskLink, TaskLinks, TriageScore } from "./types";

/**
 * Reads the Python pipeline's output under data/ (gitignored):
 *   data/clio/matter.json   scripts/export_matter.py   raw Clio records (GET only)
 *   data/triage/*.json      scripts/triage.py          Jev importance + shareability per entry
 *   data/ocr/*.json         ocr_pipeline.py            per-page document text
 *   data/links/*.json       scripts/link_tasks.py      records related to each task, waiting-on
 * Nothing about the case lives in this repo; run the scripts to populate data/.
 */

const DATA_DIR = process.env.PIPELINE_DATA_DIR ?? path.join(process.cwd(), "data");
const OCR_EXCERPT_CHARS = 1200;

type Json = Record<string, unknown>;

async function readJsonDir(dir: string): Promise<Json[]> {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(dir, f), "utf8")) as Json));
}

export function triageKey(sourceType: string, id: string): string {
  return `${sourceType}:${id}`;
}

export class PipelineMatterSource implements MatterSource {
  readonly origin = "clio" as const;
  constructor(private readonly dataDir: string = DATA_DIR) {}

  async loadMatter(): Promise<MatterBundle> {
    const exportPath = path.join(this.dataDir, "clio", "matter.json");
    if (!existsSync(exportPath)) {
      throw new Error(`No pipeline data at ${exportPath}. Run: python scripts/export_matter.py`);
    }
    const raw = JSON.parse(await readFile(exportPath, "utf8")) as ClioExport;
    const bundle = normaliseExport(raw);

    const triage: Record<string, TriageScore> = {};
    for (const t of await readJsonDir(path.join(this.dataDir, "triage"))) {
      triage[triageKey(String(t.source_type), String(t.source_id))] = {
        importance: Number(t.importance_score ?? 0),
        impact: Number(t.impact_score ?? 0),
        urgency: Number(t.urgency_score ?? 0),
        category: String(t.top_category ?? ""),
        shareableProb: Number(t.shareable_prob ?? 0),
        shareable: (t.shareable_status as TriageScore["shareable"]) ?? "internal",
        documentDate: t.date_source === "document_text" ? String(t.date).slice(0, 10) : null,
      };
    }

    const ocr = new Map((await readJsonDir(path.join(this.dataDir, "ocr"))).map((o) => [String(o.source_id), o]));
    const documents = bundle.documents.map((d) => {
      const pages = (ocr.get(d.id)?.pages as { text?: string }[] | undefined) ?? null;
      if (!pages) return d;
      const text = pages.map((p) => p.text ?? "").join("\n").replace(/\s+/g, " ").trim();
      return { ...d, pageCount: pages.length, ocrExcerpt: text.slice(0, OCR_EXCERPT_CHARS) || undefined };
    });

    const taskLinks: Record<string, TaskLinks> = {};
    for (const l of await readJsonDir(path.join(this.dataDir, "links"))) {
      const waiting = (l.waiting ?? {}) as { prob?: number; party?: string | null };
      taskLinks[String(l.task_id)] = {
        taskId: String(l.task_id),
        waiting: { prob: Number(waiting.prob ?? 0), party: waiting.party ?? null },
        links: ((l.links ?? []) as Json[]).map((x) => ({
          kind: String(x.type) as TaskLink["kind"],
          id: String(x.id),
          page: x.page === undefined ? undefined : Number(x.page),
          relation: String(x.relation) as TaskLink["relation"],
          relatedProb: Number(x.related_prob ?? 0),
          signals: (x.signals as string[] | undefined) ?? [],
        })),
      };
    }

    return { ...bundle, documents, triage, taskLinks };
  }
}

/** Re-export the matter from Clio (GET only) via the Python script, for the Sync button. */
export async function runExport(root: string = process.cwd()): Promise<void> {
  const venv = path.join(root, ".venv", "bin", "python");
  const python = process.env.PIPELINE_PYTHON ?? (existsSync(venv) ? venv : "python3");
  await promisify(execFile)(python, [path.join(root, "scripts", "export_matter.py")], { cwd: root, timeout: 120_000 });
}
