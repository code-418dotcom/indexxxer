'use client';

import { useEffect, useState } from "react";

type BrowseItem = { name: string; is_dir: boolean; rel_path: string };

export default function ToolsPage() {
  const [status, setStatus] = useState<string>("");
  const [maintMsg, setMaintMsg] = useState<string>("");
  const [maintBusy, setMaintBusy] = useState<string>("");
  const [current, setCurrent] = useState<{ media_root: string; selected_path: string } | null>(null);

  const [path, setPath] = useState<string>("");
  const [items, setItems] = useState<BrowseItem[]>([]);
  const [loadingBrowse, setLoadingBrowse] = useState(false);

  const [indexLogs, setIndexLogs] = useState<string[]>([]);
  const [indexing, setIndexing] = useState(false);

  async function refreshCurrent() {
    try {
      const res = await fetch(`/api/media/current`, { cache: "no-store" });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        setStatus(`Media current failed: ${res.status} ${t ? "- " + t : ""}`);
        return;
      }
      const data = await res.json();
      setCurrent(data);
    } catch (e: any) {
      setStatus(`Media current fetch failed: ${e?.message || e}`);
    }
  }

  async function browse(p: string) {
    setLoadingBrowse(true);
    setStatus("");
    try {
      const url = new URL(`/api/media/browse`, window.location.origin);
      if (p) url.searchParams.set("path", p);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        setStatus(`Browse failed: ${res.status} ${t ? "- " + t : ""}`);
        setItems([]);
        return;
      }
      const data = await res.json();
      setPath(data.current_rel_path || "");
      setItems(data.items || []);
    } catch (e: any) {
      setStatus(`Browse fetch failed: ${e?.message || e}`);
      setItems([]);
    } finally {
      setLoadingBrowse(false);
    }
  }

  async function selectFolder(relPath: string) {
    setStatus("");
    try {
      const res = await fetch(`/api/media/select?rel_path=${encodeURIComponent(relPath)}`, { method: "POST" });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        setStatus(`Select failed: ${res.status} ${t ? "- " + t : ""}`);
        return;
      }
      await refreshCurrent();
      setStatus(`Selected: ${relPath || "(root)"}`);
    } catch (e: any) {
      setStatus(`Select fetch failed: ${e?.message || e}`);
    }
  }

  async function importCsv(file: File) {
    setStatus("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/performers/import-csv`, { method: "POST", body: form });
      const txt = await res.text().catch(() => "");
      let data: any = {};
      try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }

      if (!res.ok) {
        setStatus(`CSV import failed: ${res.status} ${JSON.stringify(data)}`);
        return;
      }
      setStatus(`CSV import OK: created=${data.created} updated=${data.updated}`);
    } catch (e: any) {
      setStatus(`CSV import fetch failed: ${e?.message || e}`);
    }
  }

  async function startIndexing() {
    setIndexLogs(["Starting indexing..."]);
    setIndexing(true);
    setStatus("");

    try {
      const res = await fetch("/api/media/index", { method: "POST" });
      if (!res.ok) {
        const txt = await res.text();
        setIndexLogs((prev) => [...prev, `Error: ${res.status} ${txt}`]);
        setIndexing(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setIndexLogs((prev) => [...prev, "Error: No response body"]);
        setIndexing(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              const timestamp = new Date(data.timestamp).toLocaleTimeString();
              const logEntry = `[${timestamp}] ${data.message}`;
              setIndexLogs((prev) => [...prev, logEntry]);
            } catch (e) {
              setIndexLogs((prev) => [...prev, `Parse error: ${line}`]);
            }
          }
        }
      }

      setIndexLogs((prev) => [...prev, "Indexing complete!"]);
    } catch (e: any) {
      setIndexLogs((prev) => [...prev, `Error: ${e?.message || e}`]);
    } finally {
      setIndexing(false);
    }
  }

  useEffect(() => {
    refreshCurrent();
    browse("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <a href="/" style={{ textDecoration: "none", color: "black", opacity: 0.75 }}>← Back</a>
      <h1 style={{ marginTop: 10, marginBottom: 6 }}>Tools</h1>
      <div style={{ opacity: 0.7, marginBottom: 18 }}>
        Import performer CSV and browse/select a media folder mounted into the container.
      </div>

      {status ? (
        <div style={{
          padding: 12,
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "rgba(0,0,0,0.02)",
          marginBottom: 16
        }}>
          {status}
        </div>
      ) : null}

      {maintMsg ? (
        <div style={{
          padding: 12,
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "rgba(255,200,0,0.08)",
          marginBottom: 16
        }}>
          {maintMsg}
        </div>
      ) : null}

      <section style={{
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 16,
        padding: 16,
        background: "white",
        marginBottom: 16
      }}>
        <h2 style={{ marginTop: 0 }}>Maintenance</h2>
        <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 12 }}>
          Sane defaults: these actions are <b>destructive</b> and cannot be undone.
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button
            disabled={!!maintBusy}
            onClick={async () => {
              if (!confirm("Delete ALL data (performers, indexed media, settings) and clear caches?")) return;
              setMaintBusy("clean-db");
              setMaintMsg("Running: clean whole database...");
              try {
                const res = await fetch("/api/maintenance/clean-db", { method: "POST" });
                const txt = await res.text();
                if (!res.ok) throw new Error(txt);
                setMaintMsg("✅ Clean whole database complete.");
              } catch (e: any) {
                setMaintMsg(`❌ Clean whole database failed: ${e?.message || e}`);
              } finally {
                setMaintBusy("");
              }
            }}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.15)", background: "white" }}
          >
            Clean whole database
          </button>

          <button
            disabled={!!maintBusy}
            onClick={async () => {
              if (!confirm("Delete indexed media only (media index + links) and clear thumbnail caches?")) return;
              setMaintBusy("clean-indexed");
              setMaintMsg("Running: clean indexed files...");
              try {
                const res = await fetch("/api/maintenance/clean-indexed", { method: "POST" });
                const txt = await res.text();
                if (!res.ok) throw new Error(txt);
                setMaintMsg("✅ Clean indexed files complete.");
              } catch (e: any) {
                setMaintMsg(`❌ Clean indexed files failed: ${e?.message || e}`);
              } finally {
                setMaintBusy("");
              }
            }}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.15)", background: "white" }}
          >
            Clean indexed files
          </button>

          <button
            disabled={!!maintBusy}
            onClick={async () => {
              if (!confirm("Delete ALL performers and their links (keeps settings). Also clears caches.")) return;
              setMaintBusy("clean-performers");
              setMaintMsg("Running: clean performers...");
              try {
                const res = await fetch("/api/maintenance/clean-performers", { method: "POST" });
                const txt = await res.text();
                if (!res.ok) throw new Error(txt);
                setMaintMsg("✅ Clean performers complete.");
              } catch (e: any) {
                setMaintMsg(`❌ Clean performers failed: ${e?.message || e}`);
              } finally {
                setMaintBusy("");
              }
            }}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.15)", background: "white" }}
          >
            Clean performers
          </button>
        </div>
      </section>


      <section style={{
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 16,
        padding: 16,
        background: "white",
        marginBottom: 16
      }}>
        <h2 style={{ marginTop: 0 }}>Index sample_media</h2>
        <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>
          This scans all files under <code>/media</code> (mounted from <code>./sample_media</code>), stores them in the DB, and matches performers with media files.
        </div>
        <button
          onClick={startIndexing}
          disabled={indexing}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.15)",
            background: indexing ? "rgba(0,0,0,0.04)" : "white",
            cursor: indexing ? "not-allowed" : "pointer"
          }}
        >
          {indexing ? "Indexing..." : "Index now"}
        </button>

        {indexLogs.length > 0 ? (
          <div style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.12)",
            background: "rgba(0,0,0,0.02)",
            maxHeight: 400,
            overflow: "auto",
            fontFamily: "ui-monospace, SFMono-Regular",
            fontSize: 12,
            lineHeight: 1.6
          }}>
            {indexLogs.map((log, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                {log}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section style={{
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 16,
        padding: 16,
        background: "white",
        marginBottom: 16
      }}>
        <h2 style={{ marginTop: 0 }}>Import Performers CSV</h2>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importCsv(f);
          }}
        />
        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
          Required header: <code>Name</code>. Use the same headers as listed in README.md.
        </div>
      </section>

      <section style={{
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 16,
        padding: 16,
        background: "white",
      }}>
        <h2 style={{ marginTop: 0 }}>Browse Media Folder</h2>

        <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>
          Containers can only see folders mounted into <code>/media</code>. Current selected folder is stored in the DB.
        </div>

        <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>
          Selected path: <code>{current?.selected_path || "(loading...)"}</code>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <button
            onClick={() => browse("")}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.15)", background: "white" }}
            disabled={loadingBrowse}
          >
            Browse /media (root)
          </button>

          <button
            onClick={() => selectFolder(path)}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.15)", background: "white" }}
          >
            Select current folder
          </button>

          <div style={{ fontSize: 13, opacity: 0.75 }}>
            Current folder: <code>{path || "(root)"}</code>
          </div>
        </div>

        <div style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 12, overflow: "hidden" }}>
          {items.map((it) => (
            <div key={it.rel_path} style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 12px",
              borderTop: "1px solid rgba(0,0,0,0.06)",
              alignItems: "center"
            }}>
              <div style={{ fontFamily: "ui-monospace, SFMono-Regular", fontSize: 13 }}>
                {it.is_dir ? "📁" : "📄"} {it.name}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {it.is_dir ? (
                  <>
                    <button
                      onClick={() => browse(it.rel_path)}
                      style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", background: "white" }}
                      disabled={loadingBrowse}
                    >
                      Open
                    </button>
                    <button
                      onClick={() => selectFolder(it.rel_path)}
                      style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", background: "white" }}
                    >
                      Select
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
          {items.length === 0 ? (
            <div style={{ padding: 12, fontSize: 13, opacity: 0.7 }}>No items (or folder not accessible).</div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
