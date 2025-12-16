import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const apiBase = process.env.API_INTERNAL_BASE || "http://api:8000";
  const url = new URL(req.url);
  const relPath = url.searchParams.get("rel_path") || "";
  const res = await fetch(`${apiBase}/media/select?rel_path=${encodeURIComponent(relPath)}`, { method: "POST" });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
