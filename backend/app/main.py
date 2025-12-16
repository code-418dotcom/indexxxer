import csv
import io
import os
import subprocess
import zipfile
import hashlib
import mimetypes
import shutil

import re
from pathlib import Path
from fastapi import FastAPI, Depends, UploadFile, File, HTTPException, Query
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select, func, delete
from pydantic import BaseModel

from .db import Base, engine, get_db
from .models import Performer, AppSetting, MediaItem, PerformerMedia

APP_NAME = os.getenv("APP_NAME", "indexxxer")
APP_VERSION = os.getenv("APP_VERSION", "0.0.0")
MEDIA_ROOT = Path(os.getenv("MEDIA_ROOT", "/media")).resolve()
IMAGE_ROOT = Path(os.getenv("IMAGE_ROOT", "/images")).resolve()
THUMB_CACHE = Path(os.getenv("THUMB_CACHE", "/app/cache/thumbs")).resolve()
ZIP_CACHE = THUMB_CACHE / "zip"
PERFORMER_THUMB_DIR = THUMB_CACHE / "performers"

app = FastAPI(title=f"{APP_NAME} API", version=APP_VERSION)

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:13337").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    THUMB_CACHE.mkdir(parents=True, exist_ok=True)
    ZIP_CACHE.mkdir(parents=True, exist_ok=True)
    PERFORMER_THUMB_DIR.mkdir(parents=True, exist_ok=True)
    # Ensure a default media selection exists
    with next(get_db()) as db:
        sel = db.get(AppSetting, "media_selected_path")
        if not sel:
            db.add(AppSetting(key="media_selected_path", value=str(MEDIA_ROOT)))
            db.commit()


def _clear_dir(path: Path) -> None:
    """Best-effort: delete everything inside `path` and recreate it."""
    try:
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)
        path.mkdir(parents=True, exist_ok=True)
    except Exception:
        # Non-fatal maintenance helper
        pass


def _clear_thumb_caches() -> None:
    _clear_dir(ZIP_CACHE)
    _clear_dir(PERFORMER_THUMB_DIR)


def _clear_performer_thumbs(performer_id: int) -> None:
    try:
        for f in PERFORMER_THUMB_DIR.glob(f"{performer_id}_*.jpg"):
            f.unlink(missing_ok=True)
    except Exception:
        pass

def _slug_first_last(name: str) -> str:
    parts = [p for p in re.split(r"\s+", (name or "").strip()) if p]
    if not parts:
        return ""
    first = parts[0]
    last = parts[-1]
    s = f"{first}_{last}".lower()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s

def _candidate_image_paths(name: str):
    slug = _slug_first_last(name)
    if not slug:
        return []
    exts = [".jpg", ".jpeg", ".png", ".webp"]
    return [(IMAGE_ROOT / f"{slug}{ext}") for ext in exts]

def _to_int(v):
    v = (v or "").strip()
    try:
        return int(v) if v != "" else None
    except ValueError:
        return None

def _to_bool(v):
    v = (v or "").strip().lower()
    if v in ("true", "1", "yes", "y"): return True
    if v in ("false", "0", "no", "n"): return False
    return None

def _get_selected_media_path(db: Session) -> Path:
    sel = db.get(AppSetting, "media_selected_path")
    if not sel:
        return MEDIA_ROOT
    try:
        p = Path(sel.value).resolve()
    except Exception:
        return MEDIA_ROOT
    # Always keep it within MEDIA_ROOT
    try:
        p.relative_to(MEDIA_ROOT)
    except Exception:
        return MEDIA_ROOT
    return p

@app.get("/health")
def health(db: Session = Depends(get_db)):
    media_count = db.execute(select(MediaItem)).scalars().all()
    return {"app": APP_NAME, "version": APP_VERSION, "media_root": str(MEDIA_ROOT), "image_root": str(IMAGE_ROOT), "media_indexed": len(media_count)}
@app.get("/performers")
def list_performers(db: Session = Depends(get_db)):
    # Aggregate media counts per performer (scenes = videos/images, galleries = zip).
    counts = {}
    for performer_id, kind, cnt in db.execute(
        select(
            PerformerMedia.performer_id,
            MediaItem.kind,
            func.count(MediaItem.id),
        )
        .join(MediaItem, PerformerMedia.media_item_id == MediaItem.id)
        .group_by(PerformerMedia.performer_id, MediaItem.kind)
    ).all():
        entry = counts.setdefault(int(performer_id), {"scene_count": 0, "gallery_count": 0})
        k = (kind or "").lower()
        if k == "zip":
            entry["gallery_count"] += int(cnt)
        else:
            entry["scene_count"] += int(cnt)

    rows = db.execute(select(Performer).order_by(Performer.name.asc())).scalars().all()
    out = []
    for p in rows:
        d = p.__dict__.copy()
        d.pop("_sa_instance_state", None)
        c = counts.get(int(p.id), {"scene_count": 0, "gallery_count": 0})
        d["scene_count"] = c["scene_count"]
        d["gallery_count"] = c["gallery_count"]
        out.append(d)
    return out


class PerformerPayload(BaseModel):
    name: str
    aliases: str | None = None
    date_of_birth: str | None = None
    age: int | None = None
    career_status: str | None = None
    career_start: str | None = None
    career_end: str | None = None
    date_of_death: str | None = None
    place_of_birth: str | None = None
    ethnicity: str | None = None
    boobs: str | None = None
    bust: int | None = None
    cup: str | None = None
    bra: str | None = None
    waist: int | None = None
    hip: int | None = None
    butt: str | None = None
    height: int | None = None
    weight: int | None = None
    hair_color: str | None = None
    eye_color: str | None = None
    piercings: bool | None = None
    piercing_locations: str | None = None
    tattoos: bool | None = None
    tattoo_locations: str | None = None


@app.post("/performers")
def create_performer(payload: PerformerPayload, db: Session = Depends(get_db)):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(400, "Name is required")

    existing = db.execute(select(Performer).where(Performer.name == name)).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Performer already exists")

    p = Performer(**payload.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)

    d = p.__dict__.copy()
    d.pop("_sa_instance_state", None)
    d["scene_count"] = 0
    d["gallery_count"] = 0
    return d


@app.get("/performers/{performer_id}")
def get_performer(performer_id: int, db: Session = Depends(get_db)):
    p = db.get(Performer, performer_id)
    if not p:
        raise HTTPException(404, "Performer not found")
    d = p.__dict__.copy()
    d.pop("_sa_instance_state", None)
    return d


@app.delete("/performers/{performer_id}")
def delete_performer(performer_id: int, db: Session = Depends(get_db)):
    p = db.get(Performer, performer_id)
    if not p:
        raise HTTPException(404, "Performer not found")

    _clear_performer_thumbs(performer_id)
    db.delete(p)
    db.commit()
    return {"status": "deleted", "id": performer_id}


@app.get("/performers/{performer_id}/media")
def performer_media(performer_id: int, db: Session = Depends(get_db)):
    p = db.query(Performer).filter(Performer.id == performer_id).first()
    if not p:
        raise HTTPException(404, "Performer not found")

    links = (
        db.query(PerformerMedia)
        .filter(PerformerMedia.performer_id == performer_id)
        .all()
    )

    out = []
    for link in sorted(links, key=lambda l: -(l.confidence or 0.0)):
        mi = link.media_item
        if not mi:
            continue
        out.append(
            {
                "media": {
                    "id": mi.id,
                    "kind": mi.kind,
                    "rel_path": mi.rel_path,
                    "ext": mi.ext,
                    "size": mi.size,
                    "mtime": mi.mtime,
                },
                "confidence": float(link.confidence or 0.0),
                "matched_by": link.matched_by or "filename",
            }
        )
    return out

@app.get("/performers/{performer_id}/image")
def get_performer_image(performer_id: int, db: Session = Depends(get_db)):
    p = db.get(Performer, performer_id)
    if not p:
        raise HTTPException(404, "Performer not found")

    for cand in _candidate_image_paths(p.name):
        if cand.exists() and cand.is_file():
            return FileResponse(str(cand), headers={"Cache-Control": "public, max-age=300"})

    raise HTTPException(404, "Image not found")


@app.get("/performers/{performer_id}/thumb")
def get_performer_thumb(performer_id: int, size: int = 480, db: Session = Depends(get_db)):
    # Returns a cached thumbnail jpg (scaled to width=size, preserving aspect ratio)
    p = db.get(Performer, performer_id)
    if not p:
        raise HTTPException(404, "Performer not found")

    src = None
    for cand in _candidate_image_paths(p.name):
        if cand.exists() and cand.is_file():
            src = cand
            break
    if not src:
        raise HTTPException(404, "Image not found")

    safe_name = re.sub(r"[^a-zA-Z0-9._-]+", "_", p.name).strip("_").lower()
    size = max(120, min(int(size), 1600))
    out = PERFORMER_THUMB_DIR / f"{performer_id}_{safe_name}_{size}.jpg"

    if out.exists() and out.is_file():
        return FileResponse(str(out), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=300"})

    # Use ffmpeg (already installed) to convert/scale into jpg
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(src), "-vf", f"scale='min({size},iw)':-2", "-q:v", "4", str(out)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    except Exception:
        pass

    if not out.exists():
        # fallback: serve original
        return FileResponse(str(src), headers={"Cache-Control": "public, max-age=60"})

    return FileResponse(str(out), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=300"})

@app.post("/performers/import-csv")
async def import_performers_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Please upload a .csv file")

    content = await file.read()
    text = content.decode("utf-8-sig", errors="replace")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(400, "CSV appears to have no headers")

    if "Name" not in reader.fieldnames:
        raise HTTPException(400, "Missing required CSV column: Name")

    created = 0
    updated = 0

    for row in reader:
        name = (row.get("Name") or "").strip()
        if not name:
            continue

        existing = db.execute(select(Performer).where(Performer.name == name)).scalar_one_or_none()
        target = existing or Performer(name=name)

        target.aliases = row.get("Aliases")
        target.date_of_birth = row.get("Date of birth")
        target.age = _to_int(row.get("Age"))
        target.career_status = row.get("Career status")
        target.career_start = row.get("Career start")
        target.career_end = row.get("Career end")
        target.date_of_death = row.get("Date of death")
        target.place_of_birth = row.get("Place of birth")
        target.ethnicity = row.get("Ethnicity")
        target.boobs = row.get("Boobs")
        target.bust = _to_int(row.get("Bust"))
        target.cup = row.get("Cup")
        target.bra = row.get("Bra")
        target.waist = _to_int(row.get("Waist"))
        target.hip = _to_int(row.get("Hip"))
        target.butt = row.get("Butt")
        target.height = _to_int(row.get("Height"))
        target.weight = _to_int(row.get("Weight"))
        target.hair_color = row.get("Hair Color")
        target.eye_color = row.get("Eye Color")
        target.piercings = _to_bool(row.get("Piercings"))
        target.piercing_locations = row.get("Piercing locations")
        target.tattoos = _to_bool(row.get("Tattoos"))
        target.tattoo_locations = row.get("Tattoo locations")

        if existing:
            updated += 1
        else:
            db.add(target)
            created += 1

    db.commit()
    return {"created": created, "updated": updated, "total_rows": created + updated}




def _norm(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def _norm_tokens(s: str) -> set[str]:
    n = _norm(s)
    return set(n.split(" ")) if n else set()

def _norm_compact(s: str) -> str:
    return re.sub(r"\s+", "", _norm(s))

def _safe_media_path(rel_path: str) -> Path:
    base = MEDIA_ROOT
    target = (base / rel_path).resolve()
    if not str(target).startswith(str(base)):
        raise HTTPException(400, "Invalid path")
    return target

def _thumb_path_for(rel_path: str) -> Path:
    # stable filename
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "_", rel_path).strip("_")
    return THUMB_CACHE / f"{safe}.jpg"

def _zip_cache_key(rel_path: str, entry: str, size: int | None = None) -> str:
    h = hashlib.sha1()
    h.update(rel_path.encode("utf-8"))
    h.update(b"::")
    h.update(entry.encode("utf-8"))
    if size is not None:
        h.update(b"::")
        h.update(str(size).encode("utf-8"))
    return h.hexdigest()

def _zip_is_image(name: str) -> bool:
    ext = (Path(name).suffix or "").lower()
    return ext in {".jpg", ".jpeg", ".png", ".webp", ".gif"}

def _zip_list_images(zip_full: Path) -> list[str]:
    out: list[str] = []
    with zipfile.ZipFile(zip_full, "r") as z:
        for info in z.infolist():
            if info.is_dir():
                continue
            if _zip_is_image(info.filename):
                out.append(info.filename)
    # stable ordering
    out.sort(key=lambda s: s.lower())
    return out

def _zip_extract_to_tmp(zip_full: Path, entry: str, tmp_path: Path) -> Path:
    tmp_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_full, "r") as z:
        try:
            with z.open(entry, "r") as f:
                tmp_path.write_bytes(f.read())
        except KeyError:
            raise HTTPException(404, "Entry not found in zip")
    return tmp_path
def _classify_kind(p: Path) -> str:
    ext = p.suffix.lower().lstrip(".")
    if ext in {"mp4","mkv","avi","mov","wmv","webm","m4v"}:
        return "video"
    if ext in {"jpg","jpeg","png","webp","gif"}:
        return "image"
    if ext in {"zip"}:
        return "zip"
    if ext in {"pdf"}:
        return "pdf"
    return "other"

@app.post("/media/index")
async def media_index(db: Session = Depends(get_db)):
    import json
    from datetime import datetime

    async def generate():
        created = 0
        updated = 0
        total_files = 0

        def send_progress(msg: str, data: dict = None):
            payload = {"timestamp": datetime.utcnow().isoformat(), "message": msg}
            if data:
                payload.update(data)
            return f"data: {json.dumps(payload)}\n\n"

        yield send_progress("Starting media indexing...", {"phase": "scan"})

        for root, dirs, files in os.walk(MEDIA_ROOT):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for fn in files:
                if fn.startswith("."):
                    continue
                total_files += 1
                full = Path(root) / fn
                if not full.is_file():
                    continue
                try:
                    rel = str(full.relative_to(MEDIA_ROOT))
                except Exception:
                    continue

                st = full.stat()
                kind = _classify_kind(full)
                ext = full.suffix.lower().lstrip(".") or None

                # Only index images, zips, and videos
                if kind not in ("image", "video", "zip"):
                    continue

                existing = db.execute(select(MediaItem).where(MediaItem.rel_path == rel)).scalar_one_or_none()
                if existing:
                    existing.kind = kind
                    existing.ext = ext
                    existing.size = int(st.st_size)
                    existing.mtime = int(st.st_mtime)
                    updated += 1
                else:
                    db.add(MediaItem(rel_path=rel, kind=kind, ext=ext, size=int(st.st_size), mtime=int(st.st_mtime)))
                    created += 1

                if (created + updated) % 50 == 0:
                    yield send_progress(f"Scanned {created + updated} files...", {
                        "created": created,
                        "updated": updated,
                        "phase": "scan"
                    })

        db.commit()
        yield send_progress(f"Media scan complete: {created} created, {updated} updated", {
            "created": created,
            "updated": updated,
            "phase": "scan_complete"
        })

        yield send_progress("Starting performer matching...", {"phase": "matching"})

        db.execute(delete(PerformerMedia))
        db.commit()

        performers = db.execute(select(Performer)).scalars().all()
        media_items = db.execute(select(MediaItem)).scalars().all()

        matches_created = 0

        for p_idx, performer in enumerate(performers):
            if (p_idx + 1) % 10 == 0:
                yield send_progress(f"Matching performer {p_idx + 1}/{len(performers)}...", {
                    "phase": "matching",
                    "performer": p_idx + 1,
                    "total_performers": len(performers),
                    "matches": matches_created
                })

            keys = []
            if performer.name:
                keys.append(_norm_compact(performer.name))
            if performer.aliases:
                for alias in performer.aliases.split("|"):
                    a = alias.strip()
                    if a:
                        keys.append(_norm_compact(a))

            if not keys:
                continue

            for item in media_items:
                rel_norm = _norm_compact(item.rel_path)
                matched = False
                match_type = "filename"
                confidence = 0.0

                for key in keys:
                    if key in rel_norm:
                        matched = True
                        conf = len(key) / max(len(rel_norm), 1)
                        if conf > confidence:
                            confidence = conf

                if matched:
                    link = PerformerMedia(
                        performer_id=performer.id,
                        media_item_id=item.id,
                        confidence=confidence,
                        matched_by=match_type
                    )
                    db.add(link)
                    matches_created += 1

        db.commit()

        yield send_progress(f"Matching complete: {matches_created} performer-media links created", {
            "phase": "complete",
            "matches": matches_created
        })

        total = db.execute(select(MediaItem)).scalars().all()
        yield send_progress("Indexing finished!", {
            "phase": "done",
            "created": created,
            "updated": updated,
            "total": len(total),
            "matches": matches_created,
            "media_root": str(MEDIA_ROOT)
        })

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/media/stream")
def media_stream(rel_path: str = Query(..., description="Relative path within MEDIA_ROOT")):
    p = _safe_media_path(rel_path)
    if not p.exists() or not p.is_file():
        raise HTTPException(404, "File not found")

    mime, _ = mimetypes.guess_type(str(p))
    return FileResponse(str(p), media_type=mime or "application/octet-stream", headers={"Accept-Ranges": "bytes"})

@app.get("/media/thumb")
def media_thumb(rel_path: str = Query(..., description="Relative path within MEDIA_ROOT")):
    p = _safe_media_path(rel_path)
    if not p.exists() or not p.is_file():
        raise HTTPException(404, "File not found")

    out = _thumb_path_for(rel_path)
    if out.exists() and out.is_file():
        return FileResponse(str(out), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=300"})

    kind = _classify_kind(p)
    if kind == "image":
        # for now, just serve original image (browser will scale); still cache a copy as jpg
        try:
            # If it's already jpg/jpeg, we can copy; otherwise best-effort convert via ffmpeg if present
            if p.suffix.lower() in [".jpg", ".jpeg"]:
                out.write_bytes(p.read_bytes())
            else:
                # convert to jpg thumbnail-ish with ffmpeg (scale longest edge to 480)
                subprocess.run(
                    ["ffmpeg", "-y", "-i", str(p), "-vf", "scale='min(480,iw)':-2", "-q:v", "4", str(out)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                )
                if not out.exists():
                    out.write_bytes(p.read_bytes())
        except Exception:
            return FileResponse(str(p))
        return FileResponse(str(out), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=300"})

    if kind == "video":
        # generate a frame at ~1s (or first frame) scaled to 480 width
        subprocess.run(
            ["ffmpeg", "-y", "-ss", "00:00:01", "-i", str(p), "-frames:v", "1", "-vf", "scale='min(480,iw)':-2", "-q:v", "4", str(out)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        if not out.exists():
            # fallback: try first frame without -ss
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(p), "-frames:v", "1", "-vf", "scale='min(480,iw)':-2", "-q:v", "4", str(out)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        if not out.exists():
            raise HTTPException(500, "Failed to generate thumbnail (ffmpeg unavailable?)")
        return FileResponse(str(out), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=300"})

    raise HTTPException(415, "No thumbnail for this file type")

@app.get("/zip/entries")
def zip_entries(rel_path: str = Query(..., description="Zip file path relative to MEDIA_ROOT")):
    zfull = _safe_media_path(rel_path)
    if not zfull.exists() or not zfull.is_file():
        raise HTTPException(404, "Zip not found")
    if zfull.suffix.lower() != ".zip":
        raise HTTPException(400, "Not a zip file")
    entries = _zip_list_images(zfull)
    return {"rel_path": rel_path, "count": len(entries), "entries": entries}

@app.get("/zip/image")
def zip_image(rel_path: str = Query(...), entry: str = Query(...)):
    zfull = _safe_media_path(rel_path)
    if not zfull.exists() or not zfull.is_file():
        raise HTTPException(404, "Zip not found")
    if zfull.suffix.lower() != ".zip":
        raise HTTPException(400, "Not a zip file")
    # Return the original bytes for the entry
    tmp_key = _zip_cache_key(rel_path, entry)
    tmp = ZIP_CACHE / "tmp" / f"{tmp_key}{Path(entry).suffix.lower() or '.bin'}"
    _zip_extract_to_tmp(zfull, entry, tmp)
    mime, _ = mimetypes.guess_type(entry)
    return FileResponse(str(tmp), media_type=mime or "application/octet-stream", headers={"Cache-Control": "public, max-age=60"})

@app.get("/zip/thumb")
def zip_thumb(rel_path: str = Query(...), entry: str = Query(...), size: int = 360):
    zfull = _safe_media_path(rel_path)
    if not zfull.exists() or not zfull.is_file():
        raise HTTPException(404, "Zip not found")
    if zfull.suffix.lower() != ".zip":
        raise HTTPException(400, "Not a zip file")

    size = max(120, min(int(size), 1600))
    key = _zip_cache_key(rel_path, entry, size=size)
    out = ZIP_CACHE / "thumbs" / f"{key}.jpg"
    if out.exists() and out.is_file():
        return FileResponse(str(out), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=300"})

    tmp = ZIP_CACHE / "tmp" / f"{key}{Path(entry).suffix.lower() or '.bin'}"
    _zip_extract_to_tmp(zfull, entry, tmp)

    # Generate jpg thumb via ffmpeg (scale width=size)
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(tmp), "-vf", f"scale='min({size},iw)':-2", "-q:v", "4", str(out)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    except Exception:
        pass

    if not out.exists():
        # fallback: serve the extracted original
        mime, _ = mimetypes.guess_type(entry)
        return FileResponse(str(tmp), media_type=mime or "application/octet-stream", headers={"Cache-Control": "public, max-age=60"})

    return FileResponse(str(out), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=300"})

@app.get("/media/items")
def media_items(limit: int = 100, offset: int = 0, kind: str | None = None, db: Session = Depends(get_db)):
    q = select(MediaItem).order_by(MediaItem.rel_path.asc())
    if kind:
        q = q.where(MediaItem.kind == kind)
    rows = db.execute(q.offset(offset).limit(limit)).scalars().all()
    out = []
    for r in rows:
        d = r.__dict__.copy()
        d.pop("_sa_instance_state", None)
        out.append(d)
    return out

@app.get("/media/current")
def media_current(db: Session = Depends(get_db)):
    return {"media_root": str(MEDIA_ROOT), "selected_path": str(_get_selected_media_path(db))}

@app.get("/media/browse")
def media_browse(
    path: str = Query("", description="Path relative to MEDIA_ROOT (or empty for root)"),
    db: Session = Depends(get_db)
):
    # Resolve requested path within MEDIA_ROOT
    requested = (MEDIA_ROOT / path).resolve()
    try:
        requested.relative_to(MEDIA_ROOT)
    except Exception:
        raise HTTPException(400, "Invalid path")

    if not requested.exists() or not requested.is_dir():
        raise HTTPException(404, "Folder not found")

    items = []
    for child in sorted(requested.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        # ignore hidden-ish entries
        if child.name.startswith("."):
            continue
        items.append({
            "name": child.name,
            "is_dir": child.is_dir(),
            "rel_path": str(child.relative_to(MEDIA_ROOT)),
        })

    return {
        "media_root": str(MEDIA_ROOT),
        "current_rel_path": str(requested.relative_to(MEDIA_ROOT)) if requested != MEDIA_ROOT else "",
        "items": items
    }

@app.post("/media/select")
def media_select(rel_path: str, db: Session = Depends(get_db)):
    requested = (MEDIA_ROOT / rel_path).resolve()
    try:
        requested.relative_to(MEDIA_ROOT)
    except Exception:
        raise HTTPException(400, "Invalid path")

    if not requested.exists() or not requested.is_dir():
        raise HTTPException(404, "Folder not found")

    existing = db.get(AppSetting, "media_selected_path")
    if existing:
        existing.value = str(requested)
    else:
        db.add(AppSetting(key="media_selected_path", value=str(requested)))
    db.commit()

    return {"selected_path": str(requested)}


# ------------------------------
# Maintenance / reset endpoints
# ------------------------------

@app.post("/maintenance/clean-indexed")
def maintenance_clean_indexed(db: Session = Depends(get_db)):
    """Delete indexed media only (MediaItem + join table) and clear thumbnail caches."""
    db.execute(delete(PerformerMedia))
    db.execute(delete(MediaItem))
    db.commit()
    _clear_thumb_caches()
    return {"ok": True, "cleared": "indexed"}


@app.post("/maintenance/clean-performers")
def maintenance_clean_performers(db: Session = Depends(get_db)):
    """Delete performers and all related indexed links/media + clear caches."""
    db.execute(delete(PerformerMedia))
    db.execute(delete(MediaItem))
    db.execute(delete(Performer))
    db.commit()
    _clear_thumb_caches()
    return {"ok": True, "cleared": "performers"}


@app.post("/maintenance/clean-db")
def maintenance_clean_db(db: Session = Depends(get_db)):
    """Nuke everything (performers, indexed media, settings) + clear caches."""
    db.execute(delete(PerformerMedia))
    db.execute(delete(MediaItem))
    db.execute(delete(Performer))
    db.execute(delete(AppSetting))
    db.commit()
    _clear_thumb_caches()
    return {"ok": True, "cleared": "db"}
