import { NextResponse } from "next/server";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const apiBase = process.env.API_INTERNAL_BASE || "http://api:8000";
  const res = await fetch(`${apiBase}/performers/${encodeURIComponent(params.id)}/media`, { cache: "no-store" });
  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
