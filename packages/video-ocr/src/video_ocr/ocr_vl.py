"""PaddleOCR-VL 1.5 inference engine.

A 0.9B VLM (ERNIE-4.5-0.3B + vision encoder) that parses document images into
structured blocks. It uses PP-DocLayout-V3 for region detection + the VL model
for recognition. Per-block output: bbox + text content (markdown) + label.

We normalize the block output into the same {text, confidence, bbox} shape
that run_ocr (PP-OCRv5) produces so the rest of the pipeline (JSON schema,
search index, debug page) keeps working unchanged.
"""
import os
import time
from functools import lru_cache

import numpy as np


def _debug_enabled() -> bool:
    return os.environ.get("VIDEO_OCR_DEBUG_TOKENS", "").lower() in {"1", "true", "yes"}


@lru_cache(maxsize=2)
def _get_vl(device: str):
    # Force the global paddle device before the pipeline wires up its
    # submodels — the VL recognizer otherwise inherits the factory default
    # (gpu:0) and crashes on a CPU-only build.
    import paddle

    paddle.device.set_device(device)

    from paddleocr import PaddleOCRVL

    vl = PaddleOCRVL(
        pipeline_version="v1.5",
        device=device,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
    )
    if _debug_enabled():
        _install_generate_hook(vl)
    return vl


def _install_generate_hook(vl) -> None:
    """Wrap the VL recognizer's .generate() so we can see per-block token
    counts and the raw decoded string before post-processing strips markdown.

    The paddleocr/paddlex object graph differs by version and by whether
    "parallel" wrappers are present, so we walk attributes dynamically instead
    of hard-coding a path.
    """
    predictor = _find_vl_predictor(vl)
    if predictor is None:
        print("[debug] could not locate VL predictor; dumping attribute tree:")
        _dump_tree(vl)
        return
    print(f"[debug] vl predictor located: {type(predictor).__name__}")

    infer = getattr(predictor, "infer", None)
    if infer is None or not hasattr(infer, "generate"):
        print("[debug] predictor has no .infer.generate; skipping token hook")
        return

    original_generate = infer.generate

    def wrapped_generate(*args, **kwargs):
        t0 = time.perf_counter()
        preds = original_generate(*args, **kwargs)
        elapsed = time.perf_counter() - t0
        shape = _safe_shape(preds)
        print(f"  [debug] generate  tokens={shape}  elapsed={elapsed:.2f}s")
        return preds

    infer.generate = wrapped_generate

    processor = getattr(predictor, "processor", None)
    if processor is not None and hasattr(processor, "postprocess"):
        original_post = processor.postprocess

        def wrapped_post(preds, *args, **kwargs):
            texts = original_post(preds, *args, **kwargs)
            items = texts if isinstance(texts, list) else [texts]
            for i, t in enumerate(items):
                s = str(t)
                trunc = s[:200] + f"…(+{len(s) - 200} chars)" if len(s) > 200 else s
                print(f"  [debug] decoded[{i}]  len={len(s)}  {trunc!r}")
            return texts

        processor.postprocess = wrapped_post


def _find_vl_predictor(root, depth: int = 0, seen: set | None = None):
    """DFS through attributes to find an object that looks like the VL
    recognizer (has both `.infer.generate` and `.processor.postprocess`)."""
    if seen is None:
        seen = set()
    if depth > 6 or id(root) in seen:
        return None
    seen.add(id(root))

    infer = getattr(root, "infer", None)
    processor = getattr(root, "processor", None)
    if infer is not None and hasattr(infer, "generate") \
            and processor is not None and hasattr(processor, "postprocess"):
        return root

    def safe_get(obj, name):
        try:
            return getattr(obj, name)
        except Exception:
            return None

    for name in dir(root):
        if name.startswith("__"):
            continue
        child = safe_get(root, name)
        if child is None or callable(child):
            continue
        if isinstance(child, (str, int, float, bool, bytes, list, tuple, dict, set)):
            continue
        hit = _find_vl_predictor(child, depth + 1, seen)
        if hit is not None:
            return hit
    return None


def _safe_shape(obj):
    try:
        return tuple(obj.shape)
    except Exception:
        try:
            return (len(obj),)
        except Exception:
            return type(obj).__name__


def _dump_tree(root, prefix: str = "vl", depth: int = 0, seen: set | None = None) -> None:
    """Print attributes of interest for each node. Uses dir() so underscore-
    prefixed and slot-based attributes are also visible."""
    if seen is None:
        seen = set()
    if depth > 4 or id(root) in seen:
        return
    seen.add(id(root))

    def safe_get(obj, name):
        try:
            return getattr(obj, name)
        except Exception:
            return None

    # Look at every non-dunder attribute, surface the ones whose names or
    # types look container-like.
    for name in dir(root):
        if name.startswith("__"):
            continue
        val = safe_get(root, name)
        if val is None or callable(val) or isinstance(val, (str, int, float, bool, bytes, list, tuple, dict, set)):
            # Strings/ints/collections aren't predictor objects. Only descend
            # into custom objects.
            continue
        type_name = type(val).__name__
        if not any(k in name.lower() for k in ("model", "pipeline", "predictor", "rec", "infer", "processor")) \
                and not any(k in type_name.lower() for k in ("model", "pipeline", "predictor", "processor")):
            continue
        marker = ""
        if hasattr(val, "infer") and hasattr(val, "processor"):
            marker = "  <-- has .infer + .processor"
        print(f"  [debug] {prefix}.{name}: {type_name}{marker}")
        _dump_tree(val, f"{prefix}.{name}", depth + 1, seen)


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
