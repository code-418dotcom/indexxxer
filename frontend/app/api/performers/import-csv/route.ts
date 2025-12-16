import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const apiBase = process.env.API_INTERNAL_BASE || "http://api:8000";
  const formData = await req.formData();

  const res = await fetch(`${apiBase}/performers/import-csv`, {
    method: "POST",
    body: formData,
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
