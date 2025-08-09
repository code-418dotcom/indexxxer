import os, subprocess, io, shutil
from pathlib import Path
from typing import Optional
from PIL import Image

INDEX_ROOT = os.getenv("INDEX_ROOT", "/data")
THUMB_DIR = os.getenv("THUMB_DIR", "/app/app/thumbs")
TRANSCODE_DIR = os.getenv("TRANSCODE_DIR", "/app/app/transcoded")
os.makedirs(THUMB_DIR, exist_ok=True)
os.makedirs(TRANSCODE_DIR, exist_ok=True)

VIDEO_EXTS = {".mp4",".mkv",".avi",".mov",".wmv",".flv",".webm",".m4v"}
IMAGE_EXTS = {".jpg",".jpeg",".png",".gif",".bmp",".webp",".tiff",".tif"}
ZIP_EXTS   = {".zip"}
PDF_EXTS   = {".pdf"}  # future

def classify_file(path: str) -> Optional[str]:
    ext = Path(path).suffix.lower()
    if ext in VIDEO_EXTS: return "video"
    if ext in IMAGE_EXTS: return "image"
    if ext in ZIP_EXTS:   return "zip"
    if ext in PDF_EXTS:   return "pdf"
    return None

def ffprobe_json(path: str) -> Optional[dict]:
    try:
        import json
        res = subprocess.run(
            ["ffprobe","-v","error","-print_format","json","-show_format","-show_streams", path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, text=True
        )
        return json.loads(res.stdout)
    except Exception:
        return None

def extract_media_meta(path: str):
    info = ffprobe_json(path)
    duration = width = height = None
    if info:
        try:
            duration = float(info.get("format",{}).get("duration"))
        except Exception:
            duration = None
        for s in info.get("streams", []):
            if s.get("codec_type") == "video":
                width = s.get("width"); height = s.get("height"); break
    try:
        size = os.path.getsize(path)
    except Exception:
        size = None
    return duration, width, height, size

def thumb_for_video(src: str, rel_key: str) -> Optional[str]:
    out = os.path.join(THUMB_DIR, rel_key.replace(os.sep,"__") + ".jpg")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    try:
        subprocess.run(
            ["ffmpeg","-y","-ss","5","-i",src,"-frames:v","1","-q:v","2", out],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True
        )
        return out
    except Exception:
        return None

def thumb_for_image(src: str, rel_key: str) -> Optional[str]:
    out = os.path.join(THUMB_DIR, rel_key.replace(os.sep,"__") + ".jpg")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    try:
        subprocess.run(
            ["ffmpeg","-y","-i",src,"-vf","scale='min(320,iw)':-2", out],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True
        )
        return out
    except Exception:
        try:
            with Image.open(src) as im:
                im.thumbnail((320,320))
                im.convert("RGB").save(out, "JPEG", quality=85)
            return out
        except Exception:
            return None

def thumb_from_bytes(img_bytes: bytes, key: str) -> Optional[str]:
    out = os.path.join(THUMB_DIR, key + ".jpg")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    try:
        im = Image.open(io.BytesIO(img_bytes))
        im.thumbnail((320,320))
        im.convert("RGB").save(out, "JPEG", quality=85)
        return out
    except Exception:
        return None

def cached_mp4_path_for(media) -> str:
    safe = media.rel_path.replace(os.sep, "__")
    return os.path.join(TRANSCODE_DIR, safe + ".mp4")

def cached_mp4_exists(media) -> bool:
    p = cached_mp4_path_for(media)
    return os.path.exists(p) and os.path.getsize(p) > 1000

def has_nvidia_gpu() -> bool:
    return shutil.which("nvidia-smi") is not None or any(os.path.exists(p) for p in ("/dev/nvidia0", "/dev/nvidiactl"))

def is_streamable_video(path: str) -> bool:
    info = ffprobe_json(path)
    if not info:
        return False
    fmt = (info.get("format") or {}).get("format_name", "").lower()
    v = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), None)
    a = next((s for s in info.get("streams", []) if s.get("codec_type") == "audio"), None)
    if not v or not a:
        return False
    if "mp4" in fmt:
        return v.get("codec_name") == "h264" and a.get("codec_name") == "aac"
    if "webm" in fmt:
        return v.get("codec_name") in {"vp8", "vp9", "av1"} and a.get("codec_name") in {"vorbis", "opus"}
    return False

# --- HLS helpers (added) ---
import json, shutil, subprocess

def have_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None

def ffprobe_json(path: str) -> dict:
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path],
        capture_output=True, text=True
    )
    if proc.returncode != 0:
        return {}
    try:
        return json.loads(proc.stdout)
    except Exception:
        return {}

def is_directplay_mp4(path: str) -> bool:
    info = ffprobe_json(path)
    if not info: return False
    fmt = (info.get("format") or {}).get("format_name","")
    if "mp4" not in fmt: return False
    v = next((s for s in info.get("streams",[]) if s.get("codec_type")=="video"), None)
    a = next((s for s in info.get("streams",[]) if s.get("codec_type")=="audio"), None)
    return (v and a and v.get("codec_name") in {"h264"} and a.get("codec_name") in {"aac"})

def hls_dir_for(media_id: int) -> Path:
    return Path(TRANSCODE_DIR) / str(media_id) / "hls"

def hls_master_path(media_id: int) -> Path:
    return hls_dir_for(media_id) / "master.m3u8"

def ensure_hls(media_id: int, src_path: str) -> Path:
    out_dir = hls_dir_for(media_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    master = hls_master_path(media_id)
    if master.exists():
        return master

    if not have_ffmpeg():
        raise RuntimeError("ffmpeg/ffprobe not available in container")

    cmd = [
        "ffmpeg", "-y", "-i", src_path,
        "-preset", "veryfast", "-g", "48", "-sc_threshold", "0",
        "-map", "0:v:0", "-map", "0:a:0", "-c:v:0", "h264", "-c:a:0", "aac",
        "-b:v:0", "365k", "-maxrate:v:0", "438k", "-bufsize:v:0", "730k",
        "-s:v:0", "426x240", "-b:a:0", "73k",
        "-map", "0:v:0", "-map", "0:a:0", "-c:v:1", "h264", "-c:a:1", "aac",
        "-b:v:1", "1050k", "-maxrate:v:1", "1200k", "-bufsize:v:1", "2100k",
        "-s:v:1", "854x480", "-b:a:1", "128k",
        "-map", "0:v:0", "-map", "0:a:0", "-c:v:2", "h264", "-c:a:2", "aac",
        "-b:v:2", "3000k", "-maxrate:v:2", "3300k", "-bufsize:v:2", "6000k",
        "-s:v:2", "1280x720", "-b:a:2", "192k",
        "-var_stream_map", "v:0,a:0 v:1,a:1 v:2,a:2",
        "-f", "hls",
        "-hls_time", "4",
        "-hls_playlist_type", "vod",
        "-master_pl_name", "master.m3u8",
        "-hls_segment_filename", str(out_dir / "v%v" / "seg_%03d.ts"),
        str(out_dir / "v%v" / "stream.m3u8"),
    ]
    proc = subprocess.run(cmd, cwd=str(out_dir))
    if proc.returncode != 0 or not master.exists():
        raise RuntimeError("HLS generation failed")
    return master


def generate_thumb_candidates(src_path: str, out_dir: str, count: int = 6) -> list[str]:
    """Generate multiple candidate thumbnails at evenly spaced timestamps."""
    os.makedirs(out_dir, exist_ok=True)
    # Get duration via ffprobe
    try:
        p = subprocess.run([
            "ffprobe","-v","error","-show_entries","format=duration",
            "-of","default=noprint_wrappers=1:nokey=1", src_path
        ], capture_output=True, text=True, check=True)
        dur = float(p.stdout.strip())
    except Exception:
        dur = 60.0
    times = [max(0.0, dur * t) for t in [0.05,0.2,0.35,0.5,0.65,0.8]][:count]
    outs = []
    for i, t in enumerate(times, 1):
        out = os.path.join(out_dir, f"cand_{i}.jpg")
        try:
            subprocess.run(
                ["ffmpeg","-y","-ss",str(t),"-i",src_path,"-frames:v","1","-q:v","3", out],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True
            )
            outs.append(out)
        except Exception:
            pass
    return outs

def candidate_dir_for(media_id: int) -> str:
    d = os.path.join(THUMB_DIR, str(media_id), "candidates")
    os.makedirs(d, exist_ok=True)
    return d

def generate_thumb_candidates(src_path: str, out_dir: str, count: int = 6) -> list[str]:
    os.makedirs(out_dir, exist_ok=True)
    # Probe duration
    try:
        p = subprocess.run([
            "ffprobe","-v","error","-show_entries","format=duration",
            "-of","default=noprint_wrappers=1:nokey=1", src_path
        ], capture_output=True, text=True, check=True)
        dur = float((p.stdout or "60").strip())
    except Exception:
        dur = 60.0
    times = [max(0.0, dur * t) for t in [0.05,0.2,0.35,0.5,0.65,0.8]][:count]
    outs = []
    for i, t in enumerate(times, 1):
        out = os.path.join(out_dir, f"cand_{i}.jpg")
        try:
            subprocess.run(
                ["ffmpeg","-y","-ss",str(t),"-i",src_path,"-frames:v","1","-q:v","3", out],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True
            )
            outs.append(out)
        except Exception:
            pass
    return outs

# --- ZIP preview cache ---
ZIP_PREVIEW_DIR = os.path.join(THUMB_DIR, "_zip_previews")
def zip_preview_dir(media_id: int) -> str:
    d = os.path.join(ZIP_PREVIEW_DIR, str(media_id))
    os.makedirs(d, exist_ok=True)
    return d

def build_zip_previews(zip_path: str, out_dir: str, max_pages: int = 500, max_size: int = 1600) -> list[str]:
    from zipfile import ZipFile
    from io import BytesIO
    try:
        from PIL import Image
    except Exception:
        return []
    os.makedirs(out_dir, exist_ok=True)
    files = []
    try:
        with ZipFile(zip_path, "r") as z:
            names = [n for n in z.namelist() if n.lower().endswith(('.jpg','.jpeg','.png','.webp','.gif','.bmp','.tif','.tiff'))]
            names.sort()
            for i, name in enumerate(names[:max_pages], 1):
                try:
                    data = z.read(name)
                    im = Image.open(BytesIO(data)).convert("RGB")
                    w, h = im.size
                    scale = min(1.0, max_size / float(max(w, h)))
                    if scale < 1.0:
                        im = im.resize((int(w*scale), int(h*scale)))
                    out = os.path.join(out_dir, f"{i:04d}.jpg")
                    im.save(out, "JPEG", quality=85, optimize=True)
                    files.append(out)
                except Exception:
                    continue
    except Exception:
        pass
    return files

# --- Performer image cache ---
PERF_IMG_DIR = os.path.join(THUMB_DIR, "_performers")
os.makedirs(PERF_IMG_DIR, exist_ok=True)

def perf_image_path(pid: int) -> str:
    p = os.path.join(PERF_IMG_DIR, f"{pid}.jpg")
    return p

def download_file(url: str, timeout: int = 15) -> bytes | None:
    try:
        import requests
        r = requests.get(url, timeout=timeout)
        if r.status_code == 200:
            return r.content
    except Exception:
        return None
    return None


# ------------ ZIP preview cache ------------
ZIP_CACHE_DIR = os.path.join(THUMB_DIR, "_zipcache")
os.makedirs(ZIP_CACHE_DIR, exist_ok=True)

def zip_cache_dir_for(media_id: int) -> str:
    d = os.path.join(ZIP_CACHE_DIR, str(media_id))
    os.makedirs(d, exist_ok=True)
    return d
