import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const apiBase = process.env.API_INTERNAL_BASE || "http://api:8000";
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  const res = await fetch(`${apiBase}/media/items${qs ? "?" + qs : ""}`, { cache: "no-store" });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
