import { NextResponse } from "next/server";
import { canOpenDocument, readDocumentPdf, scopeFromSearch } from "@/lib/server/documents";

/**
 * The Clio document as a PDF for the embedded viewer: GET /api/documents/<id>[?role=…&provider=…|?share=…].
 * Served inline from data/raw (downloaded from Clio by ocr_pipeline.py); scoped like the views.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await canOpenDocument(id, scopeFromSearch(new URL(req.url).searchParams)))) {
    return NextResponse.json({ error: "Not available in this view" }, { status: 403 });
  }
  const pdf = await readDocumentPdf(id);
  if (!pdf) return NextResponse.json({ error: "Not downloaded yet. Run: python ocr_pipeline.py" }, { status: 404 });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${id}.pdf"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
