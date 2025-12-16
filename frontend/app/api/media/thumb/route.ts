import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const apiBase = process.env.API_INTERNAL_BASE || "http://api:8000";
  const url = new URL(req.url);
  const rel = url.searchParams.get("rel_path") || "";
  const res = await fetch(`${apiBase}/media/thumb?rel_path=${encodeURIComponent(rel)}`, { cache: "no-store" });
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=300",
    },
  });
}
