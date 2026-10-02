import { NextResponse } from "next/server";
import { getClientView, getFirmView, getProviderView } from "@/lib/server/case";

/**
 * The role-scoped payload exactly as the browser receives it. Useful for
 * verifying the access boundary: GET /api/view?role=provider&provider=<id>.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const role = url.searchParams.get("role") ?? "firm";
  if (role === "provider") {
    const view = await getProviderView(url.searchParams.get("provider") ?? undefined);
    return view ? NextResponse.json(view) : NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  if (role === "client") return NextResponse.json(await getClientView());
  return NextResponse.json(await getFirmView());
}
