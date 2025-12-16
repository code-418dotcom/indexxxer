import { NextResponse } from "next/server";

const API_BASE = process.env.API_BASE || "http://api:8000";

export async function POST() {
  const res = await fetch(`${API_BASE}/maintenance/clean-performers`, { method: "POST" });
  const txt = await res.text();
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
