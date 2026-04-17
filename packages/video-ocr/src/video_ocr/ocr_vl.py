"""PaddleOCR-VL 1.5 inference engine.

A 0.9B VLM (ERNIE-4.5-0.3B + vision encoder) that parses document images into
structured blocks. It uses PP-DocLayout-V3 for region detection + the VL model
for recognition. Per-block output: bbox + text content (markdown) + label.

We normalize the block output into the same {text, confidence, bbox} shape
that run_ocr (PP-OCRv5) produces so the rest of the pipeline (JSON schema,
search index, debug page) keeps working unchanged.
"""
from functools import lru_cache

import numpy as np


@lru_cache(maxsize=2)
def _get_vl(device: str):
    # Force the global paddle device before the pipeline wires up its
    # submodels — the VL recognizer otherwise inherits the factory default
    # (gpu:0) and crashes on a CPU-only build.
    import paddle

    paddle.device.set_device(device)

    from paddleocr import PaddleOCRVL

    return PaddleOCRVL(
        pipeline_version="v1.5",
        device=device,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
    )


def run_ocr_vl(image_bgr: np.ndarray, device: str = "cpu") -> list[dict]:
    vl = _get_vl(device)
    pages = list(vl.predict(image_bgr))

    out: list[dict] = []
    for page in pages:
        for block in _iter_blocks(page):
            text = str(_field(block, "content", "") or "").strip()
            if not text:
                continue
            out.append(
                {
                    "text": text,
                    # VLMs don't expose per-token confidence; record 1.0 so the
                    # field stays present for the rest of the pipeline.
                    "confidence": 1.0,
                    "bbox": _bbox_to_poly(_field(block, "bbox")),
                    "label": _field(block, "label"),
                }
            )
    return out


def _iter_blocks(page):
    if hasattr(page, "keys") and "parsing_res_list" in page:
        return page["parsing_res_list"] or []
    return []


def _field(obj, name, default=None):
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _bbox_to_poly(bbox) -> list[list[float]] | None:
    """PaddleOCR-VL returns axis-aligned [x1,y1,x2,y2]. Convert to the 4-point
    polygon format PP-OCRv5 uses so the frontend renders both engines the
    same way."""
    if bbox is None:
        return None
    try:
        arr = list(bbox)
    except TypeError:
        return None
    if len(arr) != 4:
        return None
    x1, y1, x2, y2 = (float(v) for v in arr)
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
