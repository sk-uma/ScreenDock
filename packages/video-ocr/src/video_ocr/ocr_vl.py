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
    """Wrap the VL recognizer's .generate() to log token counts and the raw
    decoded string per block, before post-processing strips markdown/LaTeX.

    Enabled only when VIDEO_OCR_DEBUG_TOKENS=1 so production runs stay quiet.
    """
    try:
        rec = vl.paddlex_pipeline._pipeline.vl_rec_model
        predictor = rec.batch_sampler.predictor if hasattr(rec, "batch_sampler") else rec
    except AttributeError:
        print("[debug] could not reach vl_rec predictor; skipping token hook")
        return

    # Hook postprocess so we see the raw text (after decode, before block
    # structuring). Token-count logging happens in the generate wrap below.
    infer = getattr(predictor, "infer", None)
    if infer is None:
        print("[debug] no predictor.infer; skipping token hook")
        return
    original_generate = infer.generate

    def wrapped_generate(data, *args, **kwargs):
        t0 = time.perf_counter()
        preds = original_generate(data, *args, **kwargs)
        elapsed = time.perf_counter() - t0
        # preds is a paddle tensor of token ids, shape [batch, seq_len].
        try:
            shape = tuple(preds.shape)
        except Exception:
            shape = ("?",)
        print(f"  [debug] generate: tokens={shape}  elapsed={elapsed:.2f}s")
        return preds

    infer.generate = wrapped_generate

    processor = getattr(predictor, "processor", None)
    if processor is not None and hasattr(processor, "postprocess"):
        original_post = processor.postprocess

        def wrapped_post(preds, *args, **kwargs):
            texts = original_post(preds, *args, **kwargs)
            for i, t in enumerate(texts if isinstance(texts, list) else [texts]):
                s = str(t)
                if len(s) > 200:
                    s = s[:200] + f"…(+{len(str(t)) - 200} chars)"
                print(f"  [debug] decoded[{i}] len={len(str(t))}  {s!r}")
            return texts

        processor.postprocess = wrapped_post


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
