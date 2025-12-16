import React from "react";

export type Performer = {
  id: number;
  name: string;
  aliases?: string | null;
  date_of_birth?: string | null;
  age?: number | null;
  career_status?: string | null;
  career_start?: string | null;
  career_end?: string | null;
  date_of_death?: string | null;
  place_of_birth?: string | null;
  ethnicity?: string | null;
  boobs?: string | null;
  bust?: number | null;
  cup?: string | null;
  bra?: string | null;
  waist?: number | null;
  hip?: number | null;
  butt?: string | null;
  height?: number | null;
  weight?: number | null;
  hair_color?: string | null;
  eye_color?: string | null;
  piercings?: boolean | null;
  piercing_locations?: string | null;
  tattoos?: boolean | null;
  tattoo_locations?: string | null;

  // Pre-computed counts returned by the API
  scene_count?: number;
  gallery_count?: number;
};


const FIELD_KEY_MAP: Record<string, string> = {
  "Name": "name",
  "Aliases": "aliases",
  "Date of birth": "date_of_birth",
  "Age": "age",
  "Career status": "career_status",
  "Career start": "career_start",
  "Career end": "career_end",
  "Date of death": "date_of_death",
  "Place of birth": "place_of_birth",
  "Ethnicity": "ethnicity",
  "Boobs": "boobs",
  "Bust": "bust",
  "Cup": "cup",
  "Bra": "bra",
  "Waist": "waist",
  "Hip": "hip",
  "Butt": "butt",
  "Height": "height",
  "Weight": "weight",
  "Hair Color": "hair_color",
  "Eye Color": "eye_color",
  "Piercings": "piercings",
  "Piercing locations": "piercing_locations",
  "Tattoos": "tattoos",
  "Tattoo locations": "tattoo_locations",
};
function Row({ k, v }: { k: string; v?: any }) {
  if (v === null || v === undefined || v === "") return null;
  const key = FIELD_KEY_MAP[k] || String(k).toLowerCase().replace(/\s+/g, "_");
  const value = String(v);
  const href = `/?fkey=${encodeURIComponent(key)}&fval=${encodeURIComponent(value)}`;

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        fontSize: 13,
        lineHeight: 1.4,
        cursor: "default",
        userSelect: "none",
      }}
    >
      <div style={{ width: 160, opacity: 0.7 }}>{k}</div>
      <a
        href={href}
        title="Filter by this value"
        style={{
          flex: 1,
          wordBreak: "break-word",
          color: "inherit",
          textDecoration: "underline",
          textUnderlineOffset: 3,
          cursor: "pointer",
          opacity: 0.95,
        }}
      >
        {value}
      </a>
    </div>
  );
}

type Variant = "grid" | "detail";

/**
 * grid: compact thumb in cards list; clicking the image opens a modal with the full image.
 * detail: show a large thumbnail inline (no auto-opening modal).
 */
export default function PerformerCard({
  p,
  variant = "grid",
  onDelete,
}: {
  p: Performer;
  variant?: Variant;
  onDelete?: (id: number) => void;
}) {
  const [imgOk, setImgOk] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [modalSrc, setModalSrc] = React.useState<string>("");

  const fullSrc = `/api/performers/${p.id}/image`;
  const thumbSmall = `/api/performers/${p.id}/thumb?size=480`;
  const thumbLarge = `/api/performers/${p.id}/thumb?size=1200`;
  const aliases = p.aliases?.split("|").map((s) => s.trim()).filter(Boolean);

  const scenes = typeof p.scene_count === "number" ? p.scene_count : undefined;
  const galleries = typeof p.gallery_count === "number" ? p.gallery_count : undefined;

  const isDetail = variant === "detail";

  const imageBoxStyle: React.CSSProperties = isDetail
    ? {
        width: "min(520px, 100%)",
        borderRadius: 16,
        overflow: "hidden",
        background: "rgba(0,0,0,0.04)",
        flexShrink: 0,
      }
    : {
        width: 120,
        height: 160,
        borderRadius: 14,
        overflow: "hidden",
        background: "rgba(0,0,0,0.04)",
        flexShrink: 0,
      };

  return (
    <>
      <a
        href={`/performers/${p.id}`}
        style={{ display: "block", color: "inherit", textDecoration: "none" }}
        onClick={(e) => {
          if (isDetail) e.preventDefault(); // on detail page we don't want nested navigation
        }}
      >
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.1)",
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
            background: "white",
          }}
        >
          <div style={{ display: "flex", gap: 16, alignItems: isDetail ? "flex-start" : "stretch" }}>
            <div
              role={isDetail ? "img" : "button"}
              onClick={(e) => {
                if (isDetail) return;
                e.preventDefault();
                e.stopPropagation();
                if (imgOk) {
                  setModalSrc(fullSrc);
                  setOpen(true);
                }
              }}
              title={isDetail ? "" : imgOk ? "Open image" : "No image"}
              style={{
                ...imageBoxStyle,
                cursor: !isDetail && imgOk ? "zoom-in" : "default",
              }}
            >
              {imgOk ? (
                <img
                  src={isDetail ? thumbLarge : thumbSmall}
                  alt={p.name}
                  style={{
                    width: "100%",
                    height: isDetail ? "auto" : "100%",
                    objectFit: isDetail ? "contain" : "cover",
                    display: "block",
                    background: "rgba(0,0,0,0.02)",
                  }}
                  onError={() => setImgOk(false)}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: isDetail ? 320 : "100%",
                    display: "grid",
                    placeItems: "center",
                    opacity: 0.6,
                  }}
                >
                  No image
                </div>
              )}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{p.name}</div>
                  {aliases?.length ? (
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                      Aliases: {aliases.join(", ")}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ fontSize: 12, opacity: 0.6, whiteSpace: "nowrap" }}>#{p.id}</div>
                  {onDelete && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDelete(p.id);
                      }}
                      title="Delete performer"
                      style={{
                        border: "1px solid rgba(255,0,0,0.2)",
                        background: "rgba(255,0,0,0.06)",
                        color: "#b00020",
                        borderRadius: 10,
                        padding: "6px 10px",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {(scenes !== undefined || galleries !== undefined) ? (
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {scenes !== undefined ? (
                    <span
                      style={{
                        fontSize: 12,
                        padding: "3px 8px",
                        border: "1px solid rgba(0,0,0,0.12)",
                        borderRadius: 999,
                        opacity: 0.85,
                      }}
                    >
                      Scenes: {scenes}
                    </span>
                  ) : null}
                  {galleries !== undefined ? (
                    <span
                      style={{
                        fontSize: 12,
                        padding: "3px 8px",
                        border: "1px solid rgba(0,0,0,0.12)",
                        borderRadius: 999,
                        opacity: 0.85,
                      }}
                    >
                      Galleries: {galleries}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                <Row k="Date of birth" v={p.date_of_birth} />
                <Row k="Age" v={p.age} />
                <Row k="Career status" v={p.career_status} />
                <Row k="Career start" v={p.career_start} />
                <Row k="Career end" v={p.career_end} />
                <Row k="Place of birth" v={p.place_of_birth} />
                <Row k="Ethnicity" v={p.ethnicity} />
                <Row k="Boobs" v={p.boobs} />
                <Row k="Bust" v={p.bust} />
                <Row k="Cup" v={p.cup} />
                <Row k="Bra" v={p.bra} />
                <Row k="Waist" v={p.waist} />
                <Row k="Hip" v={p.hip} />
                <Row k="Butt" v={p.butt} />
                <Row k="Height" v={p.height} />
                <Row k="Weight" v={p.weight} />
                <Row k="Hair Color" v={p.hair_color} />
                <Row k="Eye Color" v={p.eye_color} />
                <Row k="Piercings" v={p.piercings} />
                <Row k="Piercing locations" v={p.piercing_locations} />
                <Row k="Tattoos" v={p.tattoos} />
                <Row k="Tattoo locations" v={p.tattoo_locations} />
                <Row k="Date of death" v={p.date_of_death} />
              </div>
            </div>
          </div>
        </div>
      </a>

      {/* Modal only used in grid view */}
      {open ? (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "grid",
            placeItems: "center",
            padding: 24,
            zIndex: 9999,
            cursor: "zoom-out",
          }}
        >
          <img
            src={modalSrc || fullSrc}
            alt={p.name}
            style={{
              maxWidth: "min(1200px, 95vw)",
              maxHeight: "92vh",
              borderRadius: 16,
              boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
              background: "white",
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
