import json
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
    for i, kf in enumerate(
        iter_keyframes(video_path, sample_fps=sample_fps, phash_threshold=phash_threshold),
        1,
    ):
        if engine == "ppocr-vl":
            texts = run_ocr_vl(kf.image_bgr, device=device)
        else:
            texts = run_ocr(kf.image_bgr, lang=lang, variant=variant)
        records.append(
            {
                "frame": kf.index,
                "timestamp": kf.timestamp,
                "phash": kf.phash,
                "texts": texts,
            }
        )
        # Drop the image reference so the next iteration can free memory.
        kf.image_bgr = None  # type: ignore[assignment]
        print(
            f"  [{i:>3}] frame={kf.index:>6} t={kf.timestamp:6.2f}s  "
            f"texts={len(texts)}"
        )

    out_path = output_dir / f"{video_path.stem}.json"
    payload = {
        "video": video_path.name,
        "meta": asdict(meta),
        "engine": engine,
        "lang": lang,
        "variant": variant,
        "keyframes": records,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"wrote {out_path}  ({len(records)} keyframes)")
    return out_path
