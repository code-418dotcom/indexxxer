import { NextResponse } from "next/server";

export async function GET() {
  const apiBase = process.env.API_INTERNAL_BASE || "http://api:8000";
  const res = await fetch(`${apiBase}/performers`, { cache: "no-store" });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function POST(req: Request) {
  const apiBase = process.env.API_INTERNAL_BASE || "http://api:8000";
  const body = await req.text();

  const res = await fetch(`${apiBase}/performers`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
