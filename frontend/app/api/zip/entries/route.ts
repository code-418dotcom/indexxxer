import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const apiBase = process.env.API_INTERNAL_BASE || "http://api:8000";
  const url = new URL(req.url);
  const rel_path = url.searchParams.get("rel_path");
  if (!rel_path) return NextResponse.json({ error: "rel_path required" }, { status: 400 });
  const res = await fetch(`${apiBase}/zip/entries?rel_path=${encodeURIComponent(rel_path)}`, { cache: "no-store" });
  const body = await res.arrayBuffer();
  return new NextResponse(body, { status: res.status, headers: { "content-type": res.headers.get("content-type") || "application/json" } });
}
