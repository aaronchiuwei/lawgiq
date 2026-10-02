import { NextResponse } from "next/server";
import { canOpenDocument, readDocumentPages, scopeFromSearch } from "@/lib/server/documents";

/** Per-page extracted text (data/ocr) for the embedded viewer, scoped like the PDF itself. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await canOpenDocument(id, scopeFromSearch(new URL(req.url).searchParams)))) {
    return NextResponse.json({ error: "Not available in this view" }, { status: 403 });
  }
  const pages = await readDocumentPages(id);
  return pages ? NextResponse.json({ pages }) : NextResponse.json({ error: "No OCR output" }, { status: 404 });
}
