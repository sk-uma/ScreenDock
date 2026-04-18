from pathlib import Path

import typer

from video_ocr.pipeline import process_video
from video_ocr.preview import render_preview

app = typer.Typer(add_completion=False, help="Video OCR pipeline for ScreenDock.")


@app.command()
def run(
    video: Path = typer.Argument(..., exists=True, readable=True, help="Input video file."),
    output_dir: Path = typer.Option(Path("output"), "--output-dir", "-o"),
    sample_fps: float = typer.Option(2.0, "--sample-fps"),
    phash_threshold: int = typer.Option(6, "--phash-threshold"),
    lang: str = typer.Option("japan", "--lang"),
    variant: str = typer.Option("mobile", "--variant", help="mobile or server (ppocr engine)"),
    engine: str = typer.Option("ppocr", "--engine", help="ppocr (PP-OCRv5) or ppocr-vl (PaddleOCR-VL 1.5)"),
    device: str = typer.Option("cpu", "--device", help="cpu / gpu:0 / xpu / dcu"),
    max_keyframes: int = typer.Option(None, "--max-keyframes", "-n", help="Stop after N keyframes (useful for quick tests)"),
    max_new_tokens: int = typer.Option(512, "--max-new-tokens", help="Cap per-block VLM generation (ppocr-vl only)"),
):
    """Run OCR over the whole video and write the JSON index."""
    process_video(
        video_path=video,
        output_dir=output_dir,
        sample_fps=sample_fps,
        phash_threshold=phash_threshold,
        lang=lang,
        variant=variant,
        engine=engine,
        device=device,
        max_keyframes=max_keyframes,
        max_new_tokens=max_new_tokens,
    )


@app.command()
def preview(
    input: Path = typer.Argument(
        ..., exists=True, readable=True,
        help="Input video or image file (png/jpg/webp/bmp/tif).",
    ),
    at: float = typer.Option(0.0, "--at", "-t", help="Timestamp in seconds (ignored for image input)."),
    output: Path = typer.Option(Path("preview.png"), "--output", "-o", help="Annotated PNG path."),
    engine: str = typer.Option("ppocr", "--engine"),
    device: str = typer.Option("cpu", "--device"),
    lang: str = typer.Option("japan", "--lang"),
    variant: str = typer.Option("mobile", "--variant"),
    max_new_tokens: int = typer.Option(512, "--max-new-tokens"),
):
    """Run OCR on a single frame (from video or image) and save a PNG with bbox overlay."""
    out_path, actual_ts, texts, ocr_seconds = render_preview(
        input_path=input,
        output_path=output,
        timestamp_s=at,
        engine=engine,
        device=device,
        lang=lang,
        variant=variant,
        max_new_tokens=max_new_tokens,
    )
    where = f"image: {input.name}" if actual_ts is None else f"frame @ t={actual_ts:.3f}s"
    print(f"{where}  ({len(texts)} texts, engine={engine}, device={device}, ocr={ocr_seconds:.2f}s)")
    for i, t in enumerate(texts):
        print(f"  [{i:>2}] {float(t.get('confidence', 0)) * 100:5.1f}%  {t.get('text')}")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    app()
