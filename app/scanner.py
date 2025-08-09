INDEX_ROOT = "/volume3/x_adult/babes/Tiffany Thompson"
import os, threading, logging
from pathlib import Path
from sqlmodel import select
from .database import get_session
from .models import Actress, Media
from .utils import INDEX_ROOT, classify_file, extract_media_meta, thumb_for_video, thumb_for_image

_level = logging.DEBUG if os.getenv("DEBUG_MODE","false").lower()=="true" else logging.INFO
logging.basicConfig(level=_level, format="%(asctime)s [%(levelname)s] %(message)s")

INCLUDE_PDF = os.getenv("INCLUDE_PDF","false").lower() == "true"
ACTRESS_NAME = os.getenv("ACTRESS_NAME")

scan_status = {"status":"Idle","processed_count":0,"total_count":0,"current_file":None}
_scan_lock = threading.Lock(); _scan_thread=None

def _iter_actress_dirs():
    root = Path(INDEX_ROOT)
    has_subdirs = any(d.is_dir() for d in root.iterdir()) if root.exists() else False
    if has_subdirs:
        for d in sorted(root.iterdir()):
            if d.is_dir(): yield (d.name, d)
    else:
        name = ACTRESS_NAME or root.name
        yield (name, root)

ALLOWED_TYPES = ("video","image","zip") + (("pdf",) if INCLUDE_PDF else tuple())

def _count_files():
    total=0
    for _, actor_dir in _iter_actress_dirs():
        for r,_,files in os.walk(actor_dir):
            for fname in files:
                t = classify_file(str(Path(r)/fname))
                if t in ALLOWED_TYPES:
                    total += 1
    return total

def _do_scan():
    logging.info("Starting scan of INDEX_ROOT=%s", INDEX_ROOT)
    with _scan_lock: scan_status.update({"status":"Scanning","processed_count":0,"total_count":_count_files(),"current_file":None})
    with get_session() as s:
        for actress_name, actor_dir in _iter_actress_dirs():
            logging.info("Scanning actress: %s", actress_name)
            actress = s.exec(select(Actress).where(Actress.name==actress_name)).first()
            if not actress:
                actress = Actress(name=actress_name, path=str(actor_dir)); s.add(actress); s.commit(); s.refresh(actress)
            for root,_,files in os.walk(actor_dir):
                for fname in files:
                    fpath = Path(root)/fname
                    rel = fpath.relative_to(Path(INDEX_ROOT)); rel_str=str(rel)
                    mtype = classify_file(str(fpath))
                    if not mtype or mtype not in ALLOWED_TYPES: continue
                    with _scan_lock:
                        scan_status["current_file"]=rel_str; scan_status["processed_count"]+=1
                    exists = s.exec(select(Media).where(Media.rel_path==rel_str)).first()
                    if exists: continue
                    duration=width=height=size=thumb=None
                    if mtype in ("video","image"):
                        duration,width,height,size = extract_media_meta(str(fpath))
                        key = rel_str
                        thumb = thumb_for_video(str(fpath), key) if mtype=="video" else thumb_for_image(str(fpath), key)
                    else:
                        try: size = fpath.stat().st_size
                        except Exception: size=None
                    media = Media(actress_id=actress.id, path=str(fpath), rel_path=rel_str, filename=fname,
                                  ext=fpath.suffix.lower(), type=mtype, duration=duration, width=width,
                                  height=height, size_bytes=size, thumb_path=thumb)
                    s.add(media)
            s.commit()
    with _scan_lock: scan_status["status"]="Complete"; scan_status["current_file"]=None

def scan(): _do_scan()

def scan_async():
    global _scan_thread
    if _scan_thread and _scan_thread.is_alive(): return False
    _scan_thread = threading.Thread(target=_do_scan, daemon=True); _scan_thread.start(); return True
