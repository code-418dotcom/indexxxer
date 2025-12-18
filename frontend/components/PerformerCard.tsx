"use client";

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
  video_count?: number;
  image_count?: number;
};

const FIELD_KEY_MAP: Record<string, string> = {
  Name: "name",
  Aliases: "aliases",
  "Date of birth": "date_of_birth",
  Age: "age",
  "Career status": "career_status",
  "Career start": "career_start",
  "Career end": "career_end",
  "Date of death": "date_of_death",
  "Place of birth": "place_of_birth",
  Ethnicity: "ethnicity",
  Boobs: "boobs",
  Bust: "bust",
  Cup: "cup",
  Bra: "bra",
  Waist: "waist",
  Hip: "hip",
  Butt: "butt",
  Height: "height",
  Weight: "weight",
  "Hair Color": "hair_color",
  "Eye Color": "eye_color",
  Piercings: "piercings",
  "Piercing locations": "piercing_locations",
  Tattoos: "tattoos",
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

export default function PerformerCard({
  p,
  variant = "grid",
  onDelete,
}: {
  p: Performer;
  variant?: Variant;
  onDelete?: (id: number) => void;
}) {
  const aliases = p.aliases
    ?.split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  const videos = typeof p.video_count === "number" ? p.video_count : undefined;
  const images = typeof p.image_count === "number" ? p.image_count : undefined;
  const galleries = typeof p.gallery_count === "number" ? p.gallery_count : undefined;

  const mediaPills = [
    { label: "Videos", value: videos, href: "/?kind=video" },
    { label: "Images", value: images, href: "/?kind=image" },
    { label: "ZIP galleries", value: galleries, href: "/?kind=zip" },
  ].filter((m) => m.value !== undefined);

  const isDetail = variant === "detail";
  const thumbSize = isDetail ? 220 : 160;
  const thumbUrl = `/api/performers/${p.id}/thumb?size=${thumbSize * 2}`;

  const cardContent = (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, #f9fafb 100%)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        height: "100%",
      }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div
          style={{
            flexShrink: 0,
            width: thumbSize,
            height: thumbSize,
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid rgba(0,0,0,0.06)",
            boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
            background: "linear-gradient(135deg, rgba(0,0,0,0.04), rgba(0,0,0,0.08))",
          }}
        >
          <img
            src={thumbUrl}
            alt={`${p.name} portrait`}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0.25";
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{p.name}</div>
              {aliases?.length ? (
                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                  Aliases: {aliases.join(", ")}
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
        </div>
      </div>

      {mediaPills.length ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {mediaPills.map((pill) => (
            <a
              key={pill.label}
              href={pill.href}
              title={`Filter performers with ${pill.label.toLowerCase()}`}
              style={{
                fontSize: 12,
                padding: "6px 10px",
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: 999,
                opacity: 0.85,
                textDecoration: "none",
                color: "inherit",
                background: "rgba(0,0,0,0.02)",
              }}
            >
              {pill.label}: {pill.value}
            </a>
          ))}
        </div>
      ) : null}


      <div style={{ display: "grid", gap: 6 }}>
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
  );

  return (
    <>
      {isDetail ? (
        cardContent
      ) : (
        <a
          href={`/performers/${p.id}`}
          style={{ display: "block", color: "inherit", textDecoration: "none", height: "100%" }}
          onClick={(e) => {
            if (isDetail) e.preventDefault();
          }}
        >
          {cardContent}
        </a>
      )}
    </>
  );
}
