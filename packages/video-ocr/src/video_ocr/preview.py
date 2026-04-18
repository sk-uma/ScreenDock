"""Render a single frame with OCR bounding boxes for visual debugging.

Uses PIL so we can draw Japanese text labels (cv2.putText can't render CJK).
A PaddleX-bundled CJK font is preferred; if unavailable, falls back to Pillow's
default bitmap font and labels will be ASCII-only.
"""
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from video_ocr.ocr import run_ocr
from video_ocr.ocr_vl import run_ocr_vl


IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def is_image_path(path: Path) -> bool:
    return path.suffix.lower() in IMAGE_EXTS


def read_image(path: Path) -> np.ndarray:
    # Decode via cv2.imdecode so the resulting array matches what
    # VideoCapture.read() returns byte-for-byte (contiguous BGR uint8),
    # avoiding subtle differences between the video and image code paths.
    data = np.fromfile(str(path), dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        # Fallback via PIL if cv2 can't decode (e.g. exotic PNG variants).
        with Image.open(path) as pil:
            rgb = pil.convert("RGB")
        img = cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2BGR)
    return np.ascontiguousarray(img)


def extract_frame_at(video_path: Path, timestamp_s: float) -> tuple[np.ndarray, float]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")
    try:
        cap.set(cv2.CAP_PROP_POS_MSEC, timestamp_s * 1000.0)
        ok, frame = cap.read()
        if not ok:
            raise RuntimeError(f"Cannot read frame at t={timestamp_s}s")
        actual_ts = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
        return frame, actual_ts
    finally:
        cap.release()


def _conf_color(c: float) -> tuple[int, int, int]:
    if c >= 0.95:
        return (0x22, 0xAA, 0x77)
    if c >= 0.80:
        return (0xBB, 0x88, 0x00)
    return (0xCC, 0x33, 0x33)


_FONT_CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache" / "fonts"
_NOTO_SANS_JP_URL = (
    "https://raw.githubusercontent.com/googlefonts/noto-cjk/"
    "main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf"
)


def _ensure_cjk_font() -> Path | None:
    """Return a path to any TTF/OTF with Japanese coverage, downloading
    Noto Sans CJK JP on first use if nothing local works."""
    system_candidates = [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
        "/usr/share/fonts/truetype/takao-gothic/TakaoGothic.ttf",
        "/usr/share/fonts/opentype/ipaexfont-gothic/ipaexg.ttf",
        "/mnt/c/Windows/Fonts/YuGothM.ttc",
        "/mnt/c/Windows/Fonts/msgothic.ttc",
        "/mnt/c/Windows/Fonts/meiryo.ttc",
    ]
    for p in system_candidates:
        if Path(p).exists():
            return Path(p)

    cached = _FONT_CACHE_DIR / "NotoSansCJKjp-Regular.otf"
    if cached.exists() and cached.stat().st_size > 1_000_000:
        return cached

    try:
        import urllib.request

        _FONT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        print(f"[font] downloading Noto Sans CJK JP to {cached} ...")
        urllib.request.urlretrieve(_NOTO_SANS_JP_URL, cached)
        return cached
    except Exception as e:  # noqa: BLE001
        print(f"[font] could not download CJK font: {e}")
        return None


def _load_cjk_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = _ensure_cjk_font()
    if path is not None:
        try:
            return ImageFont.truetype(str(path), size=size)
        except OSError as e:
            print(f"[font] failed to load {path}: {e}")
    return ImageFont.load_default()


def draw_bboxes(image_bgr: np.ndarray, texts: list[dict]) -> Image.Image:
    img = Image.fromarray(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(img, "RGBA")
    font_size = max(12, min(28, int(img.height / 40)))
    font = _load_cjk_font(font_size)

    for i, t in enumerate(texts):
        bbox = t.get("bbox")
        if not bbox:
            continue
        color = _conf_color(float(t.get("confidence", 0.0)))
        pts = [(float(x), float(y)) for x, y in bbox]
        draw.polygon(pts, outline=color, width=2, fill=(*color, 24))

        label = f"{i}:{t.get('text','')}  {int(float(t.get('confidence',0))*100)}%"
        lx = min(p[0] for p in pts)
        ly = min(p[1] for p in pts) - font_size - 4
        if ly < 0:
            ly = min(p[1] for p in pts) + 2
        try:
            l, ty, r, by = draw.textbbox((lx, ly), label, font=font)
            draw.rectangle((l - 2, ty - 1, r + 2, by + 1), fill=(0, 0, 0, 200))
        except Exception:
            pass
        draw.text((lx, ly), label, fill=(255, 255, 255, 255), font=font)
    return img


def render_preview(
    input_path: Path,
    output_path: Path,
    timestamp_s: float = 0.0,
    engine: str = "ppocr",
    device: str = "cpu",
    lang: str = "japan",
    variant: str = "mobile",
    max_new_tokens: int = 512,
) -> tuple[Path, float | None, list[dict], float]:
    """Render one frame (from image file or from video at `timestamp_s`) with
    bbox overlay. Returns (output_path, actual_timestamp_or_None, texts,
    ocr_seconds)."""
    input_path = Path(input_path)
    if is_image_path(input_path):
        frame = read_image(input_path)
        actual_ts: float | None = None
    else:
        frame, actual_ts = extract_frame_at(input_path, timestamp_s)

    import hashlib

    h, w = frame.shape[:2]
    digest = hashlib.md5(frame.tobytes()).hexdigest()[:12]
    print(
        f"input: {input_path.name}  size={w}x{h}  "
        f"dtype={frame.dtype}  contig={frame.flags['C_CONTIGUOUS']}  md5={digest}"
    )

    t0 = time.perf_counter()
    if engine == "ppocr-vl":
        texts = run_ocr_vl(frame, device=device, max_new_tokens=max_new_tokens)
    else:
        texts = run_ocr(frame, lang=lang, variant=variant)
    ocr_elapsed = time.perf_counter() - t0

    total_chars = sum(len(str(t.get("text", ""))) for t in texts)
    print(f"ocr: {len(texts)} blocks, {total_chars} chars, {ocr_elapsed:.2f}s")

    img = draw_bboxes(frame, texts)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path)
    return output_path, actual_ts, texts, ocr_elapsed
