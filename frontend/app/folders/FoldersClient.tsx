'use client';

import { useEffect, useMemo, useState } from "react";

interface MediaItem {
  id: number;
  rel_path: string;
  kind: string;
}

type FolderSummary = {
  path: string;
  total: number;
  videos: number;
  images: number;
  zips: number;
};

function parentPath(relPath: string): string {
  const parts = relPath.split("/");
  parts.pop();
  return parts.join("/");
}

export default function FoldersClient() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [selected, setSelected] = useState<string>("");
  const [q, setQ] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setErr("");
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/media/items?limit=-1`, { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (!cancelled) setItems(Array.isArray(data) ? data : data?.items || []);
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

  const folders = useMemo<FolderSummary[]>(() => {
    const map = new Map<string, FolderSummary>();
    for (const item of items) {
      const folder = parentPath(item.rel_path) || "(root)";
      const current = map.get(folder) || {
        path: folder,
        total: 0,
        videos: 0,
        images: 0,
        zips: 0,
      };
      current.total += 1;
      if (item.kind === "video") current.videos += 1;
      if (item.kind === "image") current.images += 1;
      if (item.kind === "zip") current.zips += 1;
      map.set(folder, current);
    }

    const qq = q.trim().toLowerCase();

    return Array.from(map.values())
      .filter((f) => (!qq ? true : f.path.toLowerCase().includes(qq)))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [items, q]);

  const selectedItems = useMemo(() => {
    if (!selected) return [];
    return items.filter((i) => parentPath(i.rel_path) === selected);
  }, [items, selected]);

  return (
    <main style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 30 }}>Indexed performer folders</h1>
          <p style={{ margin: 0, opacity: 0.6, fontSize: 13 }}>
            Browse every folder that contains indexed media.
          </p>
        </div>
        <a href="/" style={{ fontSize: 14, textDecoration: "none", color: "#667eea" }}>← Back to performers</a>
      </header>

      <div
        style={{
          marginTop: 16,
          background: "white",
          borderRadius: 12,
          padding: 12,
          border: "1px solid rgba(0,0,0,0.04)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search folders…"
          style={{
            flex: "1 1 360px",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.12)",
            outline: "none",
          }}
        />
        <div style={{ fontSize: 12, opacity: 0.7 }}>Showing {folders.length} folders</div>
      </div>

      {err ? (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 12, border: "1px solid rgba(255,0,0,0.2)", background: "rgba(255,0,0,0.05)" }}>{err}</div>
      ) : null}

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        {folders.map((f) => (
          <button
            key={f.path}
            onClick={() => setSelected(f.path)}
            style={{
              textAlign: "left",
              border: selected === f.path ? "1px solid #667eea" : "1px solid rgba(0,0,0,0.08)",
              background: selected === f.path ? "rgba(102, 126, 234, 0.08)" : "white",
              borderRadius: 14,
              padding: 14,
              cursor: "pointer",
              boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 22px rgba(0,0,0,0.12)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,0.06)";
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{f.path}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, opacity: 0.75 }}>
              <span>Total {f.total}</span>
              <span>Videos {f.videos}</span>
              <span>Images {f.images}</span>
              <span>ZIPs {f.zips}</span>
            </div>
          </button>
        ))}
      </div>

      {selected ? (
        <div
          style={{
            marginTop: 20,
            background: "white",
            borderRadius: 14,
            padding: 14,
            border: "1px solid rgba(0,0,0,0.06)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Files in {selected}</h2>
            <button
              onClick={() => setSelected("")}
              style={{
                border: "1px solid rgba(0,0,0,0.1)",
                background: "rgba(0,0,0,0.02)",
                padding: "6px 10px",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              Clear selection
            </button>
          </div>

          {selectedItems.length === 0 ? (
            <div style={{ marginTop: 10, opacity: 0.7, fontSize: 13 }}>No media in this folder.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {selectedItems.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.06)",
                    background: "linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.01))",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div style={{ fontFamily: "ui-monospace, SFMono-Regular", fontSize: 12 }}>{m.rel_path}</div>
                  <span style={{ fontSize: 11, opacity: 0.65, textTransform: "uppercase" }}>{m.kind}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {loading ? <div style={{ marginTop: 12, opacity: 0.7 }}>Loading folders…</div> : null}
    </main>
  );
}
