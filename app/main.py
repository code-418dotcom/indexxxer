import os, mimetypes, subprocess
from fastapi import FastAPI, Request, Response, HTTPException, Form, BackgroundTasks
from fastapi.responses import (
    HTMLResponse,
    FileResponse,
    StreamingResponse,
    RedirectResponse,
    PlainTextResponse,
    JSONResponse,
)
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlmodel import select, delete
from pathlib import Path
from zipfile import ZipFile
from .database import init_db, get_session
from .models import Actress, Media, Performer
from . import scanner
from .utils import (
    THUMB_DIR,
    TRANSCODE_DIR,
    cached_mp4_exists,
    cached_mp4_path_for,
    candidate_dir_for,
    ensure_hls,
    generate_thumb_candidates,
    zip_cache_dir_for,
    hls_dir_for,
    hls_master_path,
    is_directplay_mp4,
    thumb_from_bytes,
    perf_image_path,
    download_file,
)




app = FastAPI(title="Indexxxer")
app.mount(
    "/static",
    StaticFiles(directory=str(Path(__file__).parent / "static")),
    name="static",
)
app.mount(
    "/transcoded",
    StaticFiles(directory=TRANSCODE_DIR),
    name="transcoded",
)
templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))

@app.on_event("startup")
def startup():
    init_db()

# ----- scan -----
@app.get("/scan/status")
def scan_status(): return scanner.scan_status

@app.get("/scan")
def scan(): started = scanner.scan_async(); return {"status":"ok","started":started}

# ----- maintenance with button -----
@app.get("/maintenance/clean", response_class=HTMLResponse)
def maintenance_page(request: Request):
    return templates.TemplateResponse("maintenance.html", {"request": request, "result": None})

@app.post("/maintenance/clean/run", response_class=HTMLResponse)
def maintenance_run(request: Request):
    allowed = {"video","image","zip"}
    if os.getenv("INCLUDE_PDF","false").lower()=="true":
        allowed.add("pdf")
    with get_session() as s:
        removed = s.exec(delete(Media).where(Media.type.notin_(allowed))).rowcount or 0
        s.commit()
        kept = len(s.exec(select(Media.id)).all())
    return templates.TemplateResponse("maintenance.html", {"request": request, "result": {"removed": removed, "kept": kept}})

# ----- helpers -----
def _actress_map():
    with get_session() as s:
        acts = s.exec(select(Actress)).all()
    return {a.id:a.name for a in acts}, acts

# ----- pages -----
@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    with get_session() as s:
        items = s.exec(select(Media).where(Media.type.in_(("video","image","zip"))).order_by(Media.filename)).all()
    a_map, acts = _actress_map()
    return templates.TemplateResponse("index.html", {"request": request, "items": items, "actress_names": a_map, "actresses": acts, "selected_actress":"", "selected_type":""})

@app.get("/search", response_class=HTMLResponse)
def search(request: Request, q: str = "", actress: str = "", type: str = ""):
    from sqlmodel import or_
    with get_session() as s:
        query = select(Media).where(Media.type.in_(("video","image","zip")))
        if q: query = query.where(Media.filename.ilike(f"%{q}%"))
        if actress:
            act = s.exec(select(Actress).where(Actress.name==actress)).first()
            if act: query = query.where(Media.actress_id==act.id)
        if type: query = query.where(Media.type==type)
        items = s.exec(query.order_by(Media.filename)).all()
    a_map, acts = _actress_map()
    return templates.TemplateResponse("index.html", {"request": request, "items": items, "actress_names": a_map, "actresses": acts, "selected_actress": actress, "selected_type": type})

@app.get("/actress/{actress_id}", response_class=HTMLResponse)
def by_actress(request: Request, actress_id: int):
    with get_session() as s:
        actress = s.get(Actress, actress_id)
        if not actress: raise HTTPException(404)
        items = s.exec(select(Media).where(Media.actress_id==actress_id).where(Media.type.in_(("video","image","zip")))).all()
    a_map, acts = _actress_map()
    return templates.TemplateResponse("actress.html", {"request": request, "actress": actress, "items": items, "actresses": acts, "selected_actress": actress.name, "selected_type": ""})

# ----- thumbs -----
@app.get("/thumb/{media_id}")
def thumb(media_id: int):
    with get_session() as s:
        m = s.get(Media, media_id)
        if not m:
            raise HTTPException(404)
        path = m.preferred_thumb or m.thumb_path
        if not path:
            raise HTTPException(404)
        return FileResponse(path)

# ----- streaming (prefer cached MP4) -----
def _file_streamer(path: str, range_header: str | None):
    file_size = os.path.getsize(path); start=0; end=file_size-1
    if range_header:
        units,_,rng = range_header.partition("=")
        if units=="bytes":
            s,_,e = rng.partition("-")
            if s.strip(): start=int(s)
            if e.strip(): end=int(e)
    if start> end or start>=file_size: raise HTTPException(416, detail="Requested Range Not Satisfiable")
    chunk_size = (end-start)+1
    def iterfile():
        with open(path,"rb") as f:
            f.seek(start); remaining=chunk_size
            while remaining>0:
                chunk=f.read(min(1024*1024, remaining))
                if not chunk: break
                remaining-=len(chunk); yield chunk
    status=206 if range_header else 200
    headers={"Content-Range": f"bytes {start}-{end}/{file_size}", "Accept-Ranges":"bytes", "Content-Length": str(chunk_size)}
    mime,_ = mimetypes.guess_type(path)
    return StreamingResponse(iterfile(), status_code=status, media_type=mime or "application/octet-stream", headers=headers)

@app.get("/stream/{media_id}")
def stream(media_id: int, request: Request):
    with get_session() as s:
        m = s.get(Media, media_id)
        if not m: raise HTTPException(404)

    path_to_serve = m.path
    if m.type == "video" and cached_mp4_exists(m):
        path_to_serve = cached_mp4_path_for(m)

    if not os.path.exists(path_to_serve): raise HTTPException(404)
    return _file_streamer(path_to_serve, request.headers.get("range"))

# ----- media page -----
@app.get("/media/{media_id}", response_class=HTMLResponse)
def media_detail(request: Request, media_id: int):
    with get_session() as s:
        m = s.get(Media, media_id)
        if not m: raise HTTPException(404)
        actress = s.get(Actress, m.actress_id)

        # For images, compute prev/next within same actress + type=image
        prev_id = next_id = None
        if m.type == "image":
            imgs = s.exec(select(Media.id).where(Media.actress_id==m.actress_id).where(Media.type=="image").order_by(Media.filename)).all()
            ids = [row[0] if isinstance(row, tuple) else row for row in imgs]
            if m.id in ids:
                i = ids.index(m.id)
                if i>0: prev_id = ids[i-1]
                if i<len(ids)-1: next_id = ids[i+1]

    return templates.TemplateResponse("media.html", {"request": request, "item": m, "actress": actress, "prev_id": prev_id, "next_id": next_id})

# ----- ZIP routes -----
def _list_zip_images(zip_path: str):
    with ZipFile(zip_path, 'r') as z:
        names = [n for n in z.namelist() if not n.endswith('/') and n.lower().endswith((".jpg",".jpeg",".png",".webp",".gif",".bmp",".tif",".tiff"))]
    return names

@app.get("/zip/{media_id}/list")
def zip_list(media_id: int):
    with get_session() as s:
        m = s.get(Media, media_id)
        if not m or m.type != "zip": raise HTTPException(404)
    return {"images": _list_zip_images(m.path)}

@app.get("/zip/{media_id}/file/{index}")
def zip_image(media_id: int, index: int):
    with get_session() as s:
        m = s.get(Media, media_id)
        if not m or m.type != "zip": raise HTTPException(404)
    names = _list_zip_images(m.path)
    if index < 0 or index >= len(names): raise HTTPException(404)
    with ZipFile(m.path, 'r') as z:
        data = z.read(names[index])
    mime = mimetypes.guess_type(names[index])[0] or "image/jpeg"
    return Response(content=data, media_type=mime)

@app.get("/zip/{media_id}/thumb/{index}")
def zip_thumb(media_id: int, index: int):
    with get_session() as s:
        m = s.get(Media, media_id)
        if not m or m.type != "zip": raise HTTPException(404)
    names = _list_zip_images(m.path)
    if index < 0 or index >= len(names): raise HTTPException(404)
    key = f"{m.rel_path.replace(os.sep,'__')}__zip__{index}"
    out = os.path.join(THUMB_DIR, key + ".jpg")
    if not os.path.exists(out):
        with ZipFile(m.path, 'r') as z:
            data = z.read(names[index])
        created = thumb_from_bytes(data, key)
        if not created: raise HTTPException(500, "Failed to make thumbnail")
    return FileResponse(out)

# ----- Transcode/remux -----
@app.post("/transcode/{media_id}")
def transcode(media_id: int):
    with get_session() as s:
        m = s.get(Media, media_id)
        if not m or m.type != "video": raise HTTPException(404)

    out = cached_mp4_path_for(m)
    os.makedirs(os.path.dirname(out), exist_ok=True)

    # Already good?
    if cached_mp4_exists(m):
        return {"status": "done", "cached": True, "path": out}

    # Try remux first
    r = subprocess.run(["ffmpeg","-y","-i", m.path, "-c","copy","-movflags","+faststart", out],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if r.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 1000:
        return {"status":"done","mode":"remux","path": out}

    # Fallback: real transcode
    tmp = out + ".tmp"
    t = subprocess.run(["ffmpeg","-y","-i", m.path,
                        "-c:v","libx264","-preset","veryfast","-crf","22",
                        "-c:a","aac","-b:a","160k",
                        "-movflags","+faststart", tmp],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if t.returncode != 0 or not os.path.exists(tmp) or os.path.getsize(tmp) <= 1000:
        if os.path.exists(tmp): os.remove(tmp)
        raise HTTPException(500, "Transcode failed")
    os.replace(tmp, out)
    return {"status":"done","mode":"transcode","path": out}

@app.get("/stream/{media_id}/master.m3u8")
def stream_master(media_id: int):
    with get_session() as s:
        m = s.get(Media, media_id)
        if not m:
            raise HTTPException(404, "Not found")
        src = Path(m.path)
        if not src.exists():
            raise HTTPException(404, "Source missing")
        master = ensure_hls(media_id, str(src))
        return FileResponse(str(master), media_type="application/vnd.apple.mpegurl")

@app.get("/media/{media_id}/thumbs", response_class=HTMLResponse)
def thumb_picker(request: Request, media_id: int):
    with get_session() as s:
        m = s.get(Media, media_id)
        if not m: raise HTTPException(404)
        if m.type != "video":
            return RedirectResponse(url=f"/media/{media_id}")
        cand_dir = os.path.join(THUMB_DIR, str(media_id), "candidates")
        cands = generate_thumb_candidates(m.path, cand_dir, count=6)
        rels = [c.replace(THUMB_DIR, "/thumbs") for c in cands]  # not actually served this way; we'll use /pick path
        return templates.TemplateResponse("thumb_picker.html", {"request": request, "item": m, "candidates": cands})


@app.post("/media/{media_id}/thumb/zip")
def thumb_from_zip_image(media_id: int, index: int = Form(...)):
    with get_session() as s:
        m = s.get(Media, media_id)
        if not m or m.type != "zip": raise HTTPException(404)
        if not os.path.exists(m.path): raise HTTPException(404, "zip missing")
        try:
            from zipfile import ZipFile
            with ZipFile(m.path, 'r') as z:
                names = [n for n in z.namelist() if n.lower().endswith(('.jpg','.jpeg','.png','.webp','.gif','.bmp','.tiff','.tif'))]
                if index < 0 or index >= len(names): raise HTTPException(400, "bad index")
                data = z.read(names[index])
                rel_key = f"{media_id}_cover"
                out = thumb_from_bytes(data, rel_key)
        except Exception as e:
            raise HTTPException(500, f"zip error: {e}")
        with get_session() as s:
            m = s.get(Media, media_id)
            m.preferred_thumb = out
            s.add(m); s.commit()
    return RedirectResponse(url=f"/media/{media_id}", status_code=303)

@app.get("/media/{media_id}/thumbs/cand/{idx}")
def cand_image(media_id: int, idx: int):
    with get_session() as s:
        mobj = s.get(Media, media_id)
        if not mobj or mobj.type != "video":
            raise HTTPException(404)
        cdir = candidate_dir_for(media_id)
        files = generate_thumb_candidates(mobj.path, cdir, count=6)
        if idx < 1 or idx > len(files):
            raise HTTPException(404)
        return FileResponse(files[idx-1])


@app.post("/maintenance/clear/run", response_class=HTMLResponse)
def maintenance_clear_run(request: Request):
    # Delete all DB rows and remove thumbnails on disk
    removed = 0
    try:
        # Clear tables
        with get_session() as s:
            s.exec(delete(Media))  # clear media
            s.exec(delete(Actress))  # clear actresses as well
            s.commit()
        # Remove thumbnails directory
        import shutil, os
        if os.path.isdir(THUMB_DIR):
            shutil.rmtree(THUMB_DIR, ignore_errors=True)
            os.makedirs(THUMB_DIR, exist_ok=True)
    except Exception as e:
        raise HTTPException(500, f"Clear failed: {e}")
    return templates.TemplateResponse("maintenance.html", {"request": request, "result": {"removed": "ALL", "kept": 0}, "cleared": True})

@app.post("/media/{media_id}/thumb/select")
def thumb_select(
    media_id: int,
    idx: int | None = Form(None),
    path: str | None = Form(None),
):
    with get_session() as s:
        mobj = s.get(Media, media_id)
        if not mobj:
            raise HTTPException(404)
        chosen = None
        if idx is not None:
            cdir = candidate_dir_for(media_id)
            files = sorted(str(p) for p in Path(cdir).glob("cand_*.jpg"))
            if not files:
                files = sorted(generate_thumb_candidates(mobj.path, cdir, count=6))
            if not (1 <= int(idx) <= len(files)):
                raise HTTPException(400, "bad index")
            chosen = files[int(idx)-1]
        elif path:
            if not os.path.exists(path):
                raise HTTPException(400, "candidate path missing")
            chosen = path
        if not chosen:
            raise HTTPException(400, "no selection provided")
        mobj.preferred_thumb = chosen
        s.add(mobj); s.commit()
    return RedirectResponse(url=f"/media/{media_id}", status_code=303)


# ----------------------------------------------------------------------------
# Performer images
# ----------------------------------------------------------------------------
@app.get("/performers/img/{pid}")
def performer_image(pid: int):
    p = perf_image_path(pid)
    if os.path.exists(p):
        return FileResponse(p)
    # default placeholder: reuse any static image or a tiny 1x1
    from starlette.responses import Response
    return Response(content=b"", media_type="image/jpeg")

# ----------------------------------------------------------------------------
# Performers list & detail
# ----------------------------------------------------------------------------
@app.get("/performers", response_class=HTMLResponse)
def performers_list(request: Request, q: str = "", page: int = 1, per: int = 48):
    page = max(1, int(page)); per = min(96, max(12, int(per)))
    with get_session() as s:
        base = s.query(Performer)
        if q:
            like = f"%{q}%"
            base = base.filter(Performer.name.like(like))
        total = base.count()
        items = base.order_by(Performer.name.asc()).offset((page-1)*per).limit(per).all()
        # media counts by name match
        name_counts = {
            n: c
            for n, c in (
                s.query(Actress.name, func.count(Media.id))
                .join(Media, Media.actress_id == Actress.id)
                .group_by(Actress.name)
                .all()
            )
        }
    pages = (total + per - 1)//per
    return templates.TemplateResponse("performers.html", {
        "request": request, "items": items, "q": q, "page": page, "pages": pages, "per": per,
        "name_counts": name_counts
    })

@app.get("/performer/{pid}", response_class=HTMLResponse)
def performer_detail(request: Request, pid: int):
    with get_session() as s:
        p = s.get(Performer, pid)
        if not p:
            raise HTTPException(404)
        media = (
            s.query(Media)
            .join(Actress, Media.actress_id == Actress.id)
            .filter(Actress.name == p.name)
            .order_by(Media.id.desc())
            .all()
        )
    return templates.TemplateResponse("performer.html", {
        "request": request, "p": p, "media": media
    })

# ----------------------------------------------------------------------------
# Performer import page + handler
# ----------------------------------------------------------------------------
from fastapi import UploadFile, File as FastFile, Form as FastForm
from sqlalchemy import func

@app.get("/maintenance/performers", response_class=HTMLResponse)
def maint_perf_page(request: Request):
    return templates.TemplateResponse("perf_import.html", {"request": request})

@app.post("/maintenance/performers/import", response_class=HTMLResponse)
async def maint_perf_import(request: Request, file: UploadFile = FastFile(...)):
    # read bytes and parse CSV leniently
    raw = await file.read()
    text = raw.decode("utf-8", errors="ignore")
    import csv, io
    reader = csv.DictReader(io.StringIO(text))
    added = updated = 0
    with get_session() as s:
        for row in reader:
            if not row: 
                continue
            # flexible keys
            def get(*keys):
                for k in keys:
                    if k in row and row[k]:
                        return row[k]
                # case-insensitive match
                for k in row:
                    if k.lower() in [kk.lower() for kk in keys] and row[k]:
                        return row[k]
                return ""
            name = (get("name","Name") or "").strip()
            if not name:
                continue
            aliases = get("Aliases","aliases")
            site_url = get("url","site_url","Official website")
            image_url = get("image_url","Image URL","image")
            bio_url = get("bio_url","Bio URL")
            profile_summary = get("profile_summary","Profile Summary")
            # upsert by name
            obj = s.query(Performer).filter(Performer.name == name).first()
            if obj:
                obj.aliases = aliases or obj.aliases
                obj.site_url = site_url or obj.site_url
                obj.image_url = image_url or obj.image_url
                obj.bio_url = bio_url or obj.bio_url
                obj.profile_summary = profile_summary or obj.profile_summary
                updated += 1
            else:
                obj = Performer(name=name, aliases=aliases or "", site_url=site_url or "",
                                image_url=image_url or "", bio_url=bio_url or "",
                                profile_summary=profile_summary or "")
                s.add(obj)
                s.flush()  # get id
                added += 1
            # cache image (best-effort)
            if image_url:
                data = download_file(image_url)
                if data:
                    pth = perf_image_path(obj.id)
                    try:
                        with open(pth, "wb") as f:
                            f.write(data)
                    except Exception:
                        pass
        s.commit()
    return templates.TemplateResponse("perf_import.html", {
        "request": request, "result": {"added": added, "updated": updated}
    })


@app.get("/media/{media_id}/zip/{index}")
def zip_image(media_id: int, index: int):
    with get_session() as s:
        mobj = s.get(Media, media_id)
        if not mobj or mobj.type != "zip":
            raise HTTPException(404)
    names = _list_zip_images(mobj.path)
    if index < 0 or index >= len(names):
        raise HTTPException(404)
    # prefer cache
    cdir = zip_cache_dir_for(media_id)
    cpath = os.path.join(cdir, f"{index:04d}.jpg")
    if os.path.exists(cpath):
        return FileResponse(cpath)
    # fallback: extract on the fly
    try:
        from PIL import Image
        from io import BytesIO
        with ZipFile(mobj.path, "r") as z:
            raw = z.read(names[index])
        img = Image.open(BytesIO(raw)).convert("RGB")
        img.save(cpath, "JPEG", quality=85)
        return FileResponse(cpath)
    except Exception:
        # serve raw bytes as-is if not image
        with ZipFile(mobj.path, "r") as z:
            data = z.read(names[index])
        from starlette.responses import Response
        return Response(content=data, media_type="application/octet-stream")


# ------------------------------------------------------------------------------
# Prewarm ZIPs (extract first N images into cache)
# ------------------------------------------------------------------------------
class PrewarmState:
    running: bool = False
    total: int = 0
    done: int = 0
    current: str | None = None

PREWARM = PrewarmState()

@app.post("/maintenance/prewarm_zips", response_class=HTMLResponse)
def maintenance_prewarm(request: Request, background: BackgroundTasks, limit: int = 60):
    if not PREWARM.running:
        PREWARM.running = True
        PREWARM.total = 0
        PREWARM.done = 0
        PREWARM.current = None

        def _run():
            try:
                from PIL import Image
                from io import BytesIO
                with get_session() as s:
                    zips = s.query(Media).filter(Media.type == "zip").all()
                PREWARM.total = len(zips)
                for i, item in enumerate(zips, 1):
                    PREWARM.current = item.filename
                    try:
                        names = _list_zip_images(item.path)[:limit]
                        cdir = zip_cache_dir_for(item.id)
                        for idx, name in enumerate(names):
                            out = os.path.join(cdir, f"{idx:04d}.jpg")
                            if os.path.exists(out):
                                continue
                            with ZipFile(item.path, "r") as z:
                                raw = z.read(name)
                            img = Image.open(BytesIO(raw)).convert("RGB")
                            img.save(out, "JPEG", quality=85)
                    except Exception:
                        pass
                    PREWARM.done = i
            finally:
                PREWARM.running = False
                PREWARM.current = None

        background.add_task(_run)
    return templates.TemplateResponse("maintenance.html", {"request": request, "prewarm": PREWARM})

@app.get("/prewarm/status")
def prewarm_status():
    return JSONResponse({"running": PREWARM.running, "done": PREWARM.done, "total": PREWARM.total, "current": PREWARM.current})
