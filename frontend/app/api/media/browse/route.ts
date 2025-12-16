import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const apiBase = process.env.API_INTERNAL_BASE || "http://api:8000";
  const url = new URL(req.url);
  const path = url.searchParams.get("path") || "";
  const res = await fetch(`${apiBase}/media/browse?path=${encodeURIComponent(path)}`, { cache: "no-store" });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
