from pathlib import Path

import typer

from video_ocr.pipeline import process_video

app = typer.Typer(add_completion=False, help="Video OCR pipeline for ScreenDock.")


@app.command()
def main(
    video: Path = typer.Argument(..., exists=True, readable=True, help="Input video file."),
    output_dir: Path = typer.Option(Path("output"), "--output-dir", "-o"),
    sample_fps: float = typer.Option(2.0, "--sample-fps"),
    phash_threshold: int = typer.Option(6, "--phash-threshold"),
    lang: str = typer.Option("japan", "--lang"),
    variant: str = typer.Option("mobile", "--variant", help="mobile or server (ppocr engine)"),
    engine: str = typer.Option("ppocr", "--engine", help="ppocr (PP-OCRv5) or ppocr-vl (PaddleOCR-VL 1.5)"),
    device: str = typer.Option("cpu", "--device", help="cpu / gpu:0 / xpu / dcu"),
):
    process_video(
        video_path=video,
        output_dir=output_dir,
        sample_fps=sample_fps,
        phash_threshold=phash_threshold,
        lang=lang,
        variant=variant,
        engine=engine,
        device=device,
    )


if __name__ == "__main__":
    app()
