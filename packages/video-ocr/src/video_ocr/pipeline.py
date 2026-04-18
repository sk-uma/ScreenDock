import json
import time
from dataclasses import asdict
from pathlib import Path

from video_ocr.frames import iter_keyframes, probe_video
from video_ocr.ocr import run_ocr
from video_ocr.ocr_vl import run_ocr_vl


def process_video(
    video_path: Path,
    output_dir: Path,
    sample_fps: float = 2.0,
    phash_threshold: int = 6,
    lang: str = "japan",
    variant: str = "mobile",
    engine: str = "ppocr",
    device: str = "cpu",
    max_keyframes: int | None = None,
) -> Path:
    video_path = Path(video_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    meta = probe_video(video_path)
    meta.sample_fps = sample_fps
    meta.phash_threshold = phash_threshold
    print(
        f"video: {video_path.name}  "
        f"fps={meta.fps:.2f}  duration={meta.duration_seconds:.1f}s  "
        f"frames={meta.frame_count}  "
        f"engine={engine}"
    )

    records = []
    ocr_total = 0.0
    pipeline_start = time.perf_counter()
    for i, kf in enumerate(
        iter_keyframes(video_path, sample_fps=sample_fps, phash_threshold=phash_threshold),
        1,
    ):
        import hashlib

        h, w = kf.image_bgr.shape[:2]
        digest = hashlib.md5(kf.image_bgr.tobytes()).hexdigest()[:12]
        t0 = time.perf_counter()
        if engine == "ppocr-vl":
            texts = run_ocr_vl(kf.image_bgr, device=device)
        else:
            texts = run_ocr(kf.image_bgr, lang=lang, variant=variant)
        elapsed = time.perf_counter() - t0
        total_chars = sum(len(str(t.get("text", ""))) for t in texts)
        ocr_total += elapsed
        records.append(
            {
                "frame": kf.index,
                "timestamp": kf.timestamp,
                "phash": kf.phash,
                "texts": texts,
                "ocr_seconds": elapsed,
            }
        )
        # Drop the image reference so the next iteration can free memory.
        kf.image_bgr = None  # type: ignore[assignment]
        print(
            f"  [{i:>3}] frame={kf.index:>6} t={kf.timestamp:6.2f}s  "
            f"size={w}x{h}  md5={digest}  "
            f"texts={len(texts):>3}  chars={total_chars:>4}  ocr={elapsed:6.2f}s"
        )
        if max_keyframes is not None and i >= max_keyframes:
            break

    total_elapsed = time.perf_counter() - pipeline_start
    avg = ocr_total / len(records) if records else 0.0
    out_path = output_dir / f"{video_path.stem}.json"
    payload = {
        "video": video_path.name,
        "meta": asdict(meta),
        "engine": engine,
        "lang": lang,
        "variant": variant,
        "timing": {
            "total_seconds": total_elapsed,
            "ocr_total_seconds": ocr_total,
            "ocr_avg_seconds": avg,
        },
        "keyframes": records,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(
        f"wrote {out_path}  ({len(records)} keyframes)  "
        f"ocr total={ocr_total:.1f}s  avg={avg:.2f}s  wall={total_elapsed:.1f}s"
    )
    return out_path
