import { NextResponse } from "next/server";

export async function POST() {
  const apiBase = process.env.API_INTERNAL_BASE || "http://api:8000";
  const res = await fetch(`${apiBase}/media/index`, { method: "POST" });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
