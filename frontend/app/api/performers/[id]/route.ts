import { NextResponse } from "next/server";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const apiBase = process.env.API_INTERNAL_BASE || "http://api:8000";
  const res = await fetch(`${apiBase}/performers/${ctx.params.id}`, { cache: "no-store" });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const apiBase = process.env.API_INTERNAL_BASE || "http://api:8000";
  const res = await fetch(`${apiBase}/performers/${ctx.params.id}`, { method: "DELETE" });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
