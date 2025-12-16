'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type MediaItem = { rel_path: string; kind: string; ext?: string | null; size?: number; mtime?: number };

function basename(p: string) {
  const parts = p.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : p;
}

export default function GalleriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [entries, setEntries] = useState<string[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [err, setErr] = useState<string>("");

  const [open, setOpen] = useState(false);
  const [openSrc, setOpenSrc] = useState("");
  const [openIndex, setOpenIndex] = useState<number>(-1);
  const [openRel, setOpenRel] = useState<string>("");

  // Load indexed media items (zips are galleries)

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

      e.preventDefault();
      if (!openRel || openIndex < 0 || entries.length === 0) return;

      const dir = e.key === "ArrowRight" ? 1 : -1;
      let next = openIndex + dir;
      if (next < 0) next = 0;
      if (next >= entries.length) next = entries.length - 1;

      if (next === openIndex) return;
      setOpenIndex(next);
      const ent = entries[next];
      setOpenSrc(`/api/zip/image?rel_path=${encodeURIComponent(openRel)}&entry=${encodeURIComponent(ent)}`);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openIndex, openRel, entries]);

  const step = (dir: number) => {
    if (!openRel || openIndex < 0 || entries.length === 0) return;
    let next = openIndex + dir;
    if (next < 0) next = 0;
    if (next >= entries.length) next = entries.length - 1;
    if (next === openIndex) return;
    setOpenIndex(next);
    const ent = entries[next];
    setOpenSrc(`/api/zip/image?rel_path=${encodeURIComponent(openRel)}&entry=${encodeURIComponent(ent)}`);
  };



  useEffect(() => {
    (async () => {
      setErr("");
      try {
        const res = await fetch(`/api/media/items`, { cache: "no-store" });
        const j = await res.json();
        const all = Array.isArray(j) ? j : j?.items || [];
        setItems(all);
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    })();
  }, []);

  const zips = useMemo(() => {
    return items.filter((x) => x.kind === "zip").sort((a, b) => a.rel_path.localeCompare(b.rel_path));
  }, [items]);

  // Sync selected with URL (?path=) — and react to changes (Next.js won't remount on same route).
  useEffect(() => {
    const p = searchParams.get("path") || "";
    if (p && p !== selected) {
      setSelected(p);
    }
    // If path removed, keep current selection (no auto-clear).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Load entries when selected changes. Clear immediately to avoid mixing old entries with new rel_path.
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      if (!selected) {
        setEntries([]);
        setLoadingEntries(false);
        return;
      }

      setErr("");
      setLoadingEntries(true);
      setEntries([]); // critical: prevents old entries requesting thumbs under new rel_path

      try {
        const res = await fetch(`/api/zip/entries?rel_path=${encodeURIComponent(selected)}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          if (!controller.signal.aborted) setErr(`Failed to load zip entries: ${res.status} ${t}`);
          if (!controller.signal.aborted) setEntries([]);
          return;
        }

        const j = await res.json();
        if (!controller.signal.aborted) {
          setEntries(Array.isArray(j?.entries) ? j.entries : []);
        }
      } catch (e: any) {
        if (!controller.signal.aborted) setErr(e?.message || String(e));
      } finally {
        if (!controller.signal.aborted) setLoadingEntries(false);
      }
    })();

    return () => controller.abort();
  }, [selected]);

  function selectGallery(relPath: string) {
    // Update state immediately for responsiveness
    setSelected(relPath);

    // Reset any open modal when switching galleries
    setOpen(false);
    setOpenSrc("");
    setOpenIndex(-1);
    setOpenRel("");

    // Keep URL in sync (so refresh / copy-paste works)
    router.replace(`/galleries?path=${encodeURIComponent(relPath)}`);
  }

  return (
    <main style={{ padding: 24, maxWidth: 1400, margin: "0 auto", background: "linear-gradient(to bottom, #f8f9fa 0%, #ffffff 100%)", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <a href="/" style={{ textDecoration: "none", color: "#667eea", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
          ← Back
        </a>
        <h1 style={{ margin: 0, fontSize: 28, background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
          Galleries
        </h1>
        <div style={{ fontSize: 13, opacity: 0.5, background: "white", padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}>
          {zips.length} total
        </div>
      </div>

      {err ? (
        <div style={{ marginTop: 12, padding: 14, borderRadius: 16, border: "1px solid rgba(239, 68, 68, 0.3)", background: "rgba(239, 68, 68, 0.08)", color: "#dc2626" }}>
          {err}
        </div>
      ) : null}

      {!selected ? (
        <div>
          <div style={{ fontSize: 14, opacity: 0.6, marginBottom: 16 }}>
            Select a gallery to view its contents
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {zips.map((z) => (
              <button
                key={z.rel_path}
                onClick={() => selectGallery(z.rel_path)}
                style={{
                  textAlign: "left",
                  padding: 20,
                  borderRadius: 16,
                  border: "none",
                  background: "white",
                  cursor: "pointer",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)";
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 12 }}>📁</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={z.rel_path}>
                  {basename(z.rel_path)}
                </div>
                <div style={{ fontSize: 12, opacity: 0.5 }}>
                  Click to view
                </div>
              </button>
            ))}
            {!zips.length ? (
              <div style={{ gridColumn: "1 / -1", padding: 48, textAlign: "center", borderRadius: 16, border: "2px dashed rgba(0,0,0,0.1)", opacity: 0.6 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
                <div style={{ fontSize: 14 }}>No galleries found. Use <b>Tools → Index now</b> to scan your media.</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <button
              onClick={() => {
                setSelected("");
                setEntries([]);
                setOpen(false);
                router.replace("/galleries");
              }}
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.1)",
                background: "white",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                color: "#667eea",
              }}
            >
              ← All Galleries
            </button>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#1f2937" }}>
              {basename(selected)}
            </div>
            <div style={{ fontSize: 13, opacity: 0.5, background: "white", padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}>
              {loadingEntries ? "Loading…" : `${entries.length} images`}
            </div>
          </div>

          {loadingEntries ? (
            <div style={{ padding: 48, textAlign: "center", borderRadius: 16, border: "2px dashed rgba(0,0,0,0.1)", opacity: 0.6 }}>
              <div style={{ fontSize: 14 }}>Loading gallery…</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {entries.map((entry, i) => (
                <button
                  key={`${selected}::${entry}`}
                  onClick={() => {
                    setOpenSrc(`/api/zip/image?rel_path=${encodeURIComponent(selected)}&entry=${encodeURIComponent(entry)}`);
                    setOpenIndex(i);
                    setOpenRel(selected);
                    setOpen(true);
                  }}
                  title={entry}
                  style={{
                    padding: 0,
                    border: "none",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "white",
                    cursor: "zoom-in",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.02)";
                    e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
                  }}
                >
                  <img
                    src={`/api/zip/thumb?rel_path=${encodeURIComponent(selected)}&entry=${encodeURIComponent(entry)}&size=360`}
                    alt={entry}
                    style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }}
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {open ? (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "grid",
            placeItems: "center",
            padding: 24,
            zIndex: 9999,
            cursor: "zoom-out",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              maxWidth: "95vw",
              maxHeight: "95vh",
              display: "grid",
              placeItems: "center",
              cursor: "default",
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
              aria-label="Previous"
              title="Previous (←)"
              style={{
                position: "absolute",
                left: -12,
                top: "50%",
                transform: "translate(-100%, -50%)",
                border: "none",
                background: "rgba(255,255,255,0.15)",
                color: "white",
                width: 44,
                height: 44,
                borderRadius: 999,
                fontSize: 28,
                lineHeight: "44px",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              ‹
            </button>

            <img
              src={openSrc}
              alt="Full size"
              style={{
                maxWidth: "95vw",
                maxHeight: "95vh",
                borderRadius: 12,
                boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
                cursor: "default",
              }}
            />

            <button
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
              aria-label="Next"
              title="Next (→)"
              style={{
                position: "absolute",
                right: -12,
                top: "50%",
                transform: "translate(100%, -50%)",
                border: "none",
                background: "rgba(255,255,255,0.15)",
                color: "white",
                width: 44,
                height: 44,
                borderRadius: 999,
                fontSize: 28,
                lineHeight: "44px",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              ›
            </button>

            <div
              style={{
                position: "absolute",
                bottom: -10,
                transform: "translateY(100%)",
                color: "rgba(255,255,255,0.85)",
                fontSize: 12,
                userSelect: "none",
              }}
            >
              {openIndex >= 0 ? `${openIndex + 1} / ${entries.length}` : ""}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
