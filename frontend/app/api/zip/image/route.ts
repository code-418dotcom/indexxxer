import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const apiBase = process.env.API_INTERNAL_BASE || "http://api:8000";
  const url = new URL(req.url);
  const rel_path = url.searchParams.get("rel_path");
  const entry = url.searchParams.get("entry");
  if (!rel_path || !entry) return NextResponse.json({ error: "rel_path and entry required" }, { status: 400 });
  const res = await fetch(`${apiBase}/zip/image?rel_path=${encodeURIComponent(rel_path)}&entry=${encodeURIComponent(entry)}`, { cache: "no-store" });
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "application/octet-stream",
      "cache-control": "public, max-age=60",
    },
  });
}
