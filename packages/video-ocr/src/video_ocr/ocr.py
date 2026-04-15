import os
from functools import lru_cache

import numpy as np

os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")


@lru_cache(maxsize=4)
def _get_ocr(lang: str, variant: str):
    # Lazy import: paddleocr pulls paddlepaddle (heavy).
    from paddleocr import PaddleOCR

    # "mobile" → PP-OCRv5_mobile_{det,rec} (~10× smaller than server).
    # "server" → PP-OCRv5_server_{det,rec} (higher accuracy, more RAM).
    det = f"PP-OCRv5_{variant}_det"
    rec = f"PP-OCRv5_{variant}_rec"
    return PaddleOCR(
        lang=lang,
        text_detection_model_name=det,
        text_recognition_model_name=rec,
        enable_mkldnn=False,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )


def run_ocr(
    image_bgr: np.ndarray, lang: str = "japan", variant: str = "mobile"
) -> list[dict]:
    ocr = _get_ocr(lang, variant)
    pages = ocr.predict(image_bgr)
    out: list[dict] = []
    for page in pages:
        texts = page.get("rec_texts", []) or []
        scores = page.get("rec_scores", []) or []
        polys = page.get("rec_polys", []) or page.get("dt_polys", []) or []
        for i, text in enumerate(texts):
            conf = float(scores[i]) if i < len(scores) else 0.0
            poly = polys[i] if i < len(polys) else None
            bbox = (
                [[float(x), float(y)] for x, y in poly.tolist()]
                if poly is not None
                else None
            )
            out.append({"text": text, "confidence": conf, "bbox": bbox})
    return out
