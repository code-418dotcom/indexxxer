'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import PerformerCard from "../components/PerformerCard";

type Performer = any;

const PAGE_SIZES: Array<{ label: string; value: number }> = [
  { label: "25", value: 25 },
  { label: "50", value: 50 },
  { label: "100", value: 100 },
  { label: "250", value: 250 },
  { label: "500", value: 500 },
  { label: "1000", value: 1000 },
  { label: "All", value: -1 },
];

export default function Page() {
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [err, setErr] = useState<string>("");
  const [apiStatus, setApiStatus] = useState<string>("checking...");
  const [q, setQ] = useState<string>("");
  const [fieldFilter, setFieldFilter] = useState<{ key: string; value: string } | null>(null);
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(1);
  const [newName, setNewName] = useState<string>("");
  const [newAliases, setNewAliases] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [saveMsg, setSaveMsg] = useState<string>("");

  const appName = process.env.NEXT_PUBLIC_APP_NAME || "indexxxer";
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";

  // background thumbnail preloading bookkeeping
  const preloadAbortRef = useRef<{ aborted: boolean }>({ aborted: false });

  useEffect(() => {
    (async () => {
      // Health
      try {
        const h = await fetch(`/api/health`, { cache: "no-store" });
        if (!h.ok) setApiStatus(`failed (${h.status})`);
        else {
          const j = await h.json().catch(() => ({}));
          setApiStatus(`ok (${j.version || "?"})`);
        }
      } catch (e: any) {
        setApiStatus(`failed: ${e?.message || e}`);
      }

      // Performers
      setErr("");
      try {
        const res = await fetch(`/api/performers`, { cache: "no-store" });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          setErr(`API error: ${res.status} ${t ? "- " + t : ""}`);
          return;
        }
        const data = await res.json();
        setPerformers(Array.isArray(data) ? data : []);

        // Media items (for galleries list)
        try {
          const mres = await fetch(`/api/media/items`, { cache: "no-store" });
          const mj = await mres.json();
          const all = Array.isArray(mj) ? mj : mj?.items || [];
          setMediaItems(all);
        } catch {
          setMediaItems([]);
        }
      } catch (e: any) {
        setErr(`Fetch failed: ${e?.message || e}`);
      }
    })();
  }, []);

  // Read a field filter from the URL (e.g. /?fkey=ethnicity&fval=Caucasian)
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const fkey = sp.get("fkey");
      const fval = sp.get("fval");
      if (fkey && fval) setFieldFilter({ key: fkey, value: fval });
      else setFieldFilter(null);
    } catch {
      // ignore
    }
  }, []);


  const galleries = useMemo(() => {
    return (mediaItems || []).filter((x: any) => x.kind === "zip").sort((a: any, b: any) => String(a.rel_path).localeCompare(String(b.rel_path)));
  }, [mediaItems]);

  
  const tagCloud = useMemo(() => {
    const fields: Array<[string, keyof Performer]> = [
      ["Hair", "hair_color"],
      ["Eyes", "eye_color"],
      ["Boobs", "boobs"],
      ["Cup", "cup"],
      ["Career", "career_status"],
      ["Birthplace", "place_of_birth"],
    ];
    const buckets: Record<string, Record<string, number>> = {};
    for (const [label] of fields) buckets[label] = {};

    for (const p of performers || []) {
      for (const [label, key] of fields) {
        const raw = (p as any)[key];
        const v = String(raw ?? "").trim();
        if (!v || v === "Unknown") continue;
        buckets[label][v] = (buckets[label][v] || 0) + 1;
      }
    }

    return fields.map(([label]) => {
      const entries = Object.entries(buckets[label] || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 60);
      const max = entries.length ? entries[0][1] : 1;
      const min = entries.length ? entries[entries.length - 1][1] : 1;

      return {
        label,
        entries: entries.map(([v, c]) => {
          const t = (c - min) / Math.max(1, max - min);
          const size = 12 + t * 12; // 12..24
          return { v, c, size };
        }),
      };
    });
  }, [performers]);
const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return performers.filter((p) => {
      if (fieldFilter) {
        const pv = (p as any)?.[fieldFilter.key];
        const s = pv === null || pv === undefined ? "" : String(pv);
        if (s.trim() !== fieldFilter.value) return false;
      }
      if (!qq) return true;
      const name = String(p?.name || "").toLowerCase();
      const aliases = String(p?.aliases || "").toLowerCase();
      return name.includes(qq) || aliases.includes(qq);
    });
  }, [performers, q, fieldFilter]);

  // Reset to page 1 whenever filters or pageSize change
  useEffect(() => {
    setPage(1);
  }, [q, fieldFilter, pageSize]);

  const total = filtered.length;
  const effectivePageSize = pageSize === -1 ? total || 1 : pageSize;
  const totalPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(total / effectivePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);


  const paged = useMemo(() => {
    if (pageSize === -1) return filtered;
    const start = (safePage - 1) * effectivePageSize;
    return filtered.slice(start, start + effectivePageSize);
  }, [filtered, pageSize, safePage, effectivePageSize]);

  // Background preload thumbnails for ALL filtered performers (not just those displayed)
  useEffect(() => {
    preloadAbortRef.current.aborted = true;
    const token = { aborted: false };
    preloadAbortRef.current = token;

    const list = filtered.map((p) => p?.id).filter((x) => typeof x === "number" || typeof x === "string");
    if (!list.length) return;

    let i = 0;
    const chunk = 24; // small chunks to keep UI snappy

    const run = () => {
      if (token.aborted) return;

      const end = Math.min(i + chunk, list.length);
      for (; i < end; i++) {
        const id = list[i];
        // preload thumb into browser cache
        const img = new Image();
        img.src = `/api/performers/${id}/thumb?size=480`;
      }

      if (i < list.length) {
        // schedule next chunk when browser is idle-ish
        if (typeof (window as any).requestIdleCallback === "function") {
          (window as any).requestIdleCallback(run, { timeout: 1000 });
        } else {
          setTimeout(run, 50);
        }
      }
    };

    // start after first paint
    setTimeout(run, 0);

    return () => {
      token.aborted = true;
    };
  }, [filtered]);

  return (
    <main style={{ padding: 24, maxWidth: 1400, margin: "0 auto", background: "linear-gradient(to bottom, #f8f9fa 0%, #ffffff 100%)", minHeight: "100vh" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32, background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{appName}</h1>
          <div style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>v{appVersion}</div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.5, background: "white", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}>
          API: <code style={{ background: "rgba(0,0,0,0.05)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{apiStatus}</code>
        </div>
      </header>

      {err ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,0,0,0.25)",
            background: "rgba(255,0,0,0.05)",
            whiteSpace: "pre-wrap",
          }}
        >
          {err}
        </div>
      ) : null}

      <div style={{ marginTop: 0, display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>
        {/* Sidebar */}
        <aside
          style={{
            position: "sticky",
            top: 24,
            alignSelf: "start",
            maxHeight: "calc(100vh - 48px)",
            overflowY: "auto",
            border: "none",
            borderRadius: 20,
            padding: 20,
            background: "white",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)",
          }}
        >
          <button
            onClick={() => (window.location.href = "/tools")}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
              boxShadow: "0 2px 8px rgba(102, 126, 234, 0.3)",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(102, 126, 234, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(102, 126, 234, 0.3)";
            }}
          >
            ⚙️ Tools
          </button>


          <div style={{ marginTop: 20, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 16 }}>
  <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13, opacity: 0.7 }}>Galleries</div>
  <a
    href="/galleries"
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 14px",
      border: "1px solid rgba(0,0,0,0.1)",
      borderRadius: 10,
      textDecoration: "none",
      fontWeight: 500,
      fontSize: 14,
      color: "#667eea",
      background: "rgba(102, 126, 234, 0.05)",
      transition: "all 0.2s",
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = "rgba(102, 126, 234, 0.1)";
      e.currentTarget.style.transform = "translateX(2px)";
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = "rgba(102, 126, 234, 0.05)";
      e.currentTarget.style.transform = "translateX(0)";
    }}
  >
    <span>📁</span>
    <span>Browse ZIP galleries</span>
  </a>
</div>


          <div style={{ marginTop: 20, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13, opacity: 0.7 }}>Add performer</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name"
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.15)",
                  outline: "none",
                }}
              />
              <input
                value={newAliases}
                onChange={(e) => setNewAliases(e.target.value)}
                placeholder="Aliases (optional)"
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.15)",
                  outline: "none",
                }}
              />
              <button
                onClick={async () => {
                  const trimmed = newName.trim();
                  setSaveMsg("");
                  if (!trimmed) {
                    setSaveMsg("Name is required");
                    return;
                  }
                  try {
                    setBusy(true);
                    const res = await fetch(`/api/performers`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ name: trimmed, aliases: newAliases.trim() || undefined }),
                    });
                    const text = await res.text();
                    if (!res.ok) {
                      setSaveMsg(text || `Failed to add performer (${res.status})`);
                      return;
                    }
                    const created = JSON.parse(text);
                    setPerformers((prev) => [...prev, created].sort((a, b) => String(a.name).localeCompare(String(b.name))));
                    setNewName("");
                    setNewAliases("");
                    setSaveMsg("Saved");
                  } catch (e: any) {
                    setSaveMsg(e?.message || String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: busy ? "rgba(0,0,0,0.08)" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: busy ? "rgba(0,0,0,0.5)" : "white",
                  cursor: busy ? "wait" : "pointer",
                  fontWeight: 600,
                }}
              >
                {busy ? "Saving…" : "Add performer"}
              </button>
              {saveMsg && <div style={{ fontSize: 12, color: "#b00020" }}>{saveMsg}</div>}
            </div>
          </div>

          <div style={{ marginTop: 20, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13, opacity: 0.7 }}>Filters</div>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
            Click any tag to filter
          </div>

          {tagCloud.map((group) => (
            <div key={group.label} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {group.label}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {group.entries.length === 0 ? (
                  <span style={{ fontSize: 12, opacity: 0.4 }}>—</span>
                ) : (
                  group.entries.map((t) => (
                    <button
                      key={t.v}
                      title={`${t.v} (${t.c} performers)`}
                      onClick={() => {
                        const map: any = {
                          Hair: "hair_color",
                          Eyes: "eye_color",
                          Boobs: "boobs",
                          Cup: "cup",
                          Career: "career_status",
                          Birthplace: "place_of_birth",
                        };
                        const fkey = map[group.label] || group.label;
                        const params = new URLSearchParams(window.location.search);
                        params.set("fkey", fkey);
                        params.set("fval", t.v);
                        window.location.href = `/?${params.toString()}`;
                      }}
                      style={{
                        fontSize: 11,
                        background: "linear-gradient(135deg, rgba(102, 126, 234, 0.08), rgba(118, 75, 162, 0.08))",
                        border: "1px solid rgba(102, 126, 234, 0.2)",
                        padding: "4px 10px",
                        borderRadius: 12,
                        cursor: "pointer",
                        color: "#667eea",
                        fontWeight: 500,
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15))";
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = "0 2px 8px rgba(102, 126, 234, 0.2)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "linear-gradient(135deg, rgba(102, 126, 234, 0.08), rgba(118, 75, 162, 0.08))";
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      {t.v}
                    </button>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
</aside>

        {/* Content */}
        <section>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search performers (name or alias)…"
              style={{
                flex: "1 1 420px",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.15)",
                outline: "none",
              }}
            />

            {fieldFilter && (
              <button
                onClick={() => {
                  setFieldFilter(null);
                  const sp = new URLSearchParams(window.location.search);
                  sp.delete("fkey");
                  sp.delete("fval");
                  const qs = sp.toString();
                  window.history.replaceState({}, "", qs ? `/?${qs}` : "/");
                }}
                title="Clear field filter"
                style={{
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "rgba(0,0,0,0.03)",
                  cursor: "pointer",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                }}
              >
                Filter: {fieldFilter.key} = {fieldFilter.value} ✕
              </button>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Per page</div>
              <select
                value={String(pageSize)}
                onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "white",
                }}
              >
                {PAGE_SIZES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Showing <b>{paged.length}</b> of <b>{total}</b>
            </div>
          </div>

          {/* Pagination controls */}
          {pageSize !== -1 ? (
            <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: safePage <= 1 ? "rgba(0,0,0,0.04)" : "white",
                  cursor: safePage <= 1 ? "not-allowed" : "pointer",
                }}
              >
                ← Prev
              </button>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Page <b>{safePage}</b> of <b>{totalPages}</b>
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: safePage >= totalPages ? "rgba(0,0,0,0.04)" : "white",
                  cursor: safePage >= totalPages ? "not-allowed" : "pointer",
                }}
              >
                Next →
              </button>
            </div>
          ) : null}

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
              gap: 16,
            }}
          >
            {paged.map((p) => (
              <PerformerCard
                key={p.id}
                p={p}
                onDelete={async (id) => {
                  if (!confirm("Delete this performer?")) return;
                  try {
                    const res = await fetch(`/api/performers/${id}`, { method: "DELETE" });
                    const text = await res.text();
                    if (!res.ok) {
                      alert(text || `Failed to delete (${res.status})`);
                      return;
                    }
                    setPerformers((prev) => prev.filter((x) => x.id !== id));
                  } catch (e: any) {
                    alert(e?.message || String(e));
                  }
                }}
              />
            ))}
          </div>

          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.6 }}>
            Background loading: thumbnails are preloaded for all matching performers, even if they are on other pages.
          </div>
        </section>
      </div>
    </main>
  );
}
