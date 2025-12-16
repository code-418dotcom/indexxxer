import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const apiBase = process.env.API_INTERNAL_BASE || "http://api:8000";
  const res = await fetch(`${apiBase}/performers/${params.id}/image`, { cache: "no-store" });

  if (!res.ok) {
    return new NextResponse("Not Found", { status: res.status });
  }

  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "content-type": res.headers.get("content-type") || "image/jpeg",
      "cache-control": res.headers.get("cache-control") || "public, max-age=300",
    },
  });
}
