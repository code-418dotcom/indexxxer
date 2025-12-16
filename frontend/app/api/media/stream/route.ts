import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rel_path = url.searchParams.get("rel_path");

  if (!rel_path) {
    return NextResponse.json({ error: "Missing rel_path" }, { status: 400 });
  }

  const apiUrl = new URL(
    `/media/stream?rel_path=${encodeURIComponent(rel_path)}`,
    process.env.API_INTERNAL_BASE || "http://api:8000"
  );

  const res = await fetch(apiUrl.toString(), {
    headers: {
      Range: req.headers.get("range") || "",
    },
  });

  const headers = new Headers();
  if (res.headers.get("content-type")) {
    headers.set("content-type", res.headers.get("content-type")!);
  }
  if (res.headers.get("content-length")) {
    headers.set("content-length", res.headers.get("content-length")!);
  }
  if (res.headers.get("content-range")) {
    headers.set("content-range", res.headers.get("content-range")!);
  }
  if (res.headers.get("accept-ranges")) {
    headers.set("accept-ranges", res.headers.get("accept-ranges")!);
  }

  headers.set("Cache-Control", "public, max-age=3600");

  return new NextResponse(res.body, {
    status: res.status,
    headers,
  });
}
