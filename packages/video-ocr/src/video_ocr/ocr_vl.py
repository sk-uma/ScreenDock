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

    # Install the debug hook at class level BEFORE the pipeline instantiates
    # the model. Class-level monkey-patching avoids having to find the exact
    # object reference in the paddleocr/paddlex wrapper graph.
    if _debug_enabled():
        _patch_paddleocr_vl_class()

    from paddleocr import PaddleOCRVL

    return PaddleOCRVL(
        pipeline_version="v1.5",
        device=device,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
    )


_patched = False


def _patch_paddleocr_vl_class() -> None:
    """Wrap PaddleOCRVLForConditionalGeneration.generate at class level.

    Every instance the pipeline creates shares this method, so patching the
    class is enough — no need to crawl the wrapper object graph.
    """
    global _patched
    if _patched:
        return
    try:
        from paddlex.inference.models.doc_vlm.modeling.paddleocr_vl._paddleocr_vl import (
            PaddleOCRVLForConditionalGeneration,
        )
    except ImportError as e:
        print(f"[debug] could not import PaddleOCRVLForConditionalGeneration: {e}")
        return

    original_generate = PaddleOCRVLForConditionalGeneration.generate

    def wrapped_generate(self, inputs, **kwargs):
        t0 = time.perf_counter()
        out = original_generate(self, inputs, **kwargs)
        elapsed = time.perf_counter() - t0
        shape = _safe_shape(out)
        seq_in = _safe_shape(inputs.get("input_ids") if isinstance(inputs, dict) else inputs)
        new_tokens = kwargs.get("max_new_tokens", "?")
        print(f"  [debug] VL.generate  input_ids={seq_in}  output={shape}  max_new={new_tokens}  elapsed={elapsed:.2f}s")
        return out

    PaddleOCRVLForConditionalGeneration.generate = wrapped_generate
    print("[debug] patched PaddleOCRVLForConditionalGeneration.generate")
    _patched = True


def _install_generate_hook(vl) -> None:  # kept for reference; unused
    return _install_generate_hook_legacy(vl)


def _install_generate_hook_legacy(vl) -> None:
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
    """Print non-callable attributes by combining vars() and dir() so both
    __dict__ and property descriptors are surfaced."""
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

    names = set()
    if hasattr(root, "__dict__"):
        names.update(vars(root).keys())
    names.update(n for n in dir(root) if not n.startswith("__"))

    for name in sorted(names):
        val = safe_get(root, name)
        if val is None or callable(val):
            continue
        if isinstance(val, (str, int, float, bool, bytes)):
            continue
        type_name = type(val).__name__
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
