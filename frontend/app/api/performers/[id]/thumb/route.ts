import { NextResponse } from "next/server";

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const apiBase = process.env.API_INTERNAL_BASE || "http://api:8000";
  const url = new URL(req.url);
  const size = url.searchParams.get("size") || "480";
  const res = await fetch(`${apiBase}/performers/${ctx.params.id}/thumb?size=${encodeURIComponent(size)}`, { cache: "no-store" });
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=300",
    },
  });
}
