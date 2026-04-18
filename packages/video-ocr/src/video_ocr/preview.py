"""Render a single frame with OCR bounding boxes for visual debugging.

Uses PIL so we can draw Japanese text labels (cv2.putText can't render CJK).
A PaddleX-bundled CJK font is preferred; if unavailable, falls back to Pillow's
default bitmap font and labels will be ASCII-only.
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from video_ocr.ocr import run_ocr
from video_ocr.ocr_vl import run_ocr_vl


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


def _load_cjk_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    # PaddleX ships a CJK-capable font with its pipelines; prefer that so
    # Japanese labels render properly.
    candidates = [
        "/home/takuk/ScreenDock/ScreenDock/packages/video-ocr/.venv/lib/python3.13/site-packages/paddlex/utils/fonts/PingFang-SC-Regular.ttf",
        "/home/takuk/ScreenDock/ScreenDock/packages/video-ocr/.venv/lib/python3.13/site-packages/paddlex/utils/fonts/simfang.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]
    for p in candidates:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size=size)
            except OSError:
                continue
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
    video_path: Path,
    timestamp_s: float,
    output_path: Path,
    engine: str = "ppocr",
    device: str = "cpu",
    lang: str = "japan",
    variant: str = "mobile",
) -> tuple[Path, float, list[dict]]:
    frame, actual_ts = extract_frame_at(video_path, timestamp_s)
    if engine == "ppocr-vl":
        texts = run_ocr_vl(frame, device=device)
    else:
        texts = run_ocr(frame, lang=lang, variant=variant)

    img = draw_bboxes(frame, texts)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path)
    return output_path, actual_ts, texts
