'use client';

import { useEffect, useMemo, useState } from "react";

interface MediaItem {
  id: number;
  rel_path: string;
  kind: string;
  size?: number | null;
  mtime?: number | null;
}

function formatSize(bytes?: number | null) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let b = bytes;
  let i = 0;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(1)} ${units[i]}`;
}

export default function VideosClient() {
  const [videos, setVideos] = useState<MediaItem[]>([]);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [q, setQ] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setErr("");
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/media/items?limit=-1&kind=video`, { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (!cancelled) setVideos(Array.isArray(data) ? data : data?.items || []);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return videos;
    return videos.filter((v) => v.rel_path.toLowerCase().includes(qq));
  }, [q, videos]);

  return (
    <main style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 30 }}>All indexed videos</h1>
          <p style={{ margin: 0, opacity: 0.6, fontSize: 13 }}>Browse every video that has been indexed.</p>
        </div>
        <a href="/" style={{ fontSize: 14, textDecoration: "none", color: "#667eea" }}>← Back to performers</a>
      </header>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          background: "white",
          padding: 12,
          borderRadius: 12,
          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
          border: "1px solid rgba(0,0,0,0.04)",
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by path…"
          style={{
            flex: "1 1 360px",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.12)",
            outline: "none",
          }}
        />
        <div style={{ fontSize: 12, opacity: 0.7 }}>Showing {filtered.length} of {videos.length}</div>
      </div>

      {err ? (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 12, border: "1px solid rgba(255,0,0,0.2)", background: "rgba(255,0,0,0.04)" }}>{err}</div>
      ) : null}

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        {filtered.map((m) => (
          <div
            key={m.id}
            style={{
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 14,
              overflow: "hidden",
              background: "white",
              boxShadow: "0 6px 20px rgba(0,0,0,0.06)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ position: "relative", aspectRatio: "16 / 9", background: "linear-gradient(135deg, rgba(0,0,0,0.05), rgba(0,0,0,0.08))" }}>
              <img
                src={`/api/media/thumb?rel_path=${encodeURIComponent(m.rel_path)}`}
                alt={m.rel_path}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  pointerEvents: "none",
                  color: "rgba(255,255,255,0.9)",
                  textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                  fontSize: 28,
                }}
              >
                ▶
              </div>
            </div>
            <div style={{ padding: 12, display: "grid", gap: 6 }}>
              <div style={{ fontFamily: "ui-monospace, SFMono-Regular", fontSize: 12, lineHeight: 1.4 }}>{m.rel_path}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{formatSize(m.size ?? undefined)}</div>
            </div>
          </div>
        ))}
      </div>

      {loading ? <div style={{ marginTop: 12, opacity: 0.7, fontSize: 13 }}>Loading videos…</div> : null}
    </main>
  );
}
