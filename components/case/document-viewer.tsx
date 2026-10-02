"use client";

import { ArrowSquareOutIcon, CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { SourceRef } from "@/lib/clio/types";
import { cn } from "@/lib/utils";

type Page = { page: number; text: string; method: string; charCount: number };

/**
 * The Clio document itself, embedded in the source drawer. The PDF comes from
 * /api/documents/<id> (the file ocr_pipeline.py downloaded from Clio), opened at
 * the page the citation points to; the extracted text for that page sits below.
 * `scope` carries the viewer's role so the server only serves what that view cites.
 */
export function DocumentViewer({ source, scope }: { source: SourceRef; scope: string }) {
  // The drawer remounts this per document and page (see its key), so the start page needs no syncing.
  const [page, setPage] = useState(source.page ?? 1);
  const [loaded, setLoaded] = useState<{ key: string; pages: Page[] | null } | null>(null);
  const qs = scope ? `?${scope}` : "";
  const key = `${source.id}${qs}`;
  const pages = loaded?.key === key ? loaded.pages : null;
  const failed = loaded?.key === key && loaded.pages === null;
  const total = pages?.length ?? source.pageCount ?? 0;

  useEffect(() => {
    let live = true;
    fetch(`/api/documents/${source.id}/pages${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { pages: Page[] }) => live && setLoaded({ key, pages: d.pages }))
      .catch(() => live && setLoaded({ key, pages: null }));
    return () => {
      live = false;
    };
  }, [source.id, qs, key]);

  const go = (n: number) => setPage(Math.min(Math.max(1, n), total || 1));
  const current = pages?.find((p) => p.page === page);
  // A changed query string makes the browser's PDF viewer jump; a hash-only change is often ignored.
  const src = `/api/documents/${source.id}${qs ? `${qs}&` : "?"}p=${page}#page=${page}&view=FitH`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-soft">
        {total > 1 ? (
          total <= 18 ? (
            Array.from({ length: total }, (_, i) => i + 1).map((n) => {
              const ocr = pages?.[n - 1]?.method === "tesseract";
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => go(n)}
                  aria-current={n === page}
                  title={ocr ? "Scanned page (OCR)" : undefined}
                  className={cn(
                    "tnum grid h-7 min-w-7 place-items-center rounded-full border px-1.5 transition-colors duration-150",
                    n === page ? "border-signal bg-signal text-paper" : ocr ? "border-caution/60 hover:border-signal" : "border-line hover:border-signal hover:text-ink",
                  )}
                >
                  {n}
                </button>
              );
            })
          ) : (
            <>
              <button type="button" onClick={() => go(page - 1)} aria-label="Previous page" className="grid size-7 place-items-center rounded-full border border-line hover:border-signal">
                <CaretLeftIcon size={13} />
              </button>
              <label className="flex items-center gap-1.5">
                Page
                <input
                  type="number"
                  min={1}
                  max={total}
                  value={page}
                  onChange={(e) => go(Number(e.target.value))}
                  className="tnum h-7 w-16 rounded-full border border-line bg-card-bg px-2.5 text-ink"
                />
                <span className="tnum">of {total}</span>
              </label>
              <button type="button" onClick={() => go(page + 1)} aria-label="Next page" className="grid size-7 place-items-center rounded-full border border-line hover:border-signal">
                <CaretRightIcon size={13} />
              </button>
            </>
          )
        ) : null}
        <a href={`/api/documents/${source.id}${qs}`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-signal hover:underline">
          Open PDF <ArrowSquareOutIcon size={13} aria-hidden />
        </a>
      </div>

      <iframe key={source.id} title={source.label} src={src} className="min-h-[24rem] w-full flex-1 rounded-[8px] border border-line bg-paper-2" />

      <details className="rounded-[8px] border border-line">
        <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium text-ink">
          Extracted text, page {page}
          {current ? <span className="font-normal text-ink-soft"> · {current.method === "tesseract" ? "OCR" : "text layer"} · {current.charCount} chars</span> : null}
        </summary>
        <p className="max-h-64 overflow-y-auto whitespace-pre-wrap border-t border-line px-3 py-2.5 text-[13px] leading-relaxed text-ink">
          {failed ? "No extracted text for this document yet." : current ? current.text || "(empty page)" : "Loading…"}
        </p>
      </details>
    </div>
  );
}
