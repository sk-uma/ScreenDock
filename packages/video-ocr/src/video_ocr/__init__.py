import os
from pathlib import Path

# This HOME is read-only on this machine; redirect every third-party cache the
# OCR stack tries to open in $HOME into the package dir so first-run model
# downloads can actually land somewhere writable.
_CACHE_ROOT = Path(__file__).resolve().parents[2] / ".cache"
_CACHE_ROOT.mkdir(parents=True, exist_ok=True)
for var, sub in [
    ("PADDLE_PDX_CACHE_HOME", "paddlex"),
    ("HF_HOME", "huggingface"),
    ("HUGGINGFACE_HUB_CACHE", "huggingface/hub"),
    ("XDG_CACHE_HOME", "xdg"),
]:
    os.environ.setdefault(var, str(_CACHE_ROOT / sub))

from video_ocr.pipeline import process_video  # noqa: E402

__all__ = ["process_video"]
