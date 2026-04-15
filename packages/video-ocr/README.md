# video-ocr

Screen-recording OCR pipeline for ScreenDock.

Pipeline: video → pHash-deduped keyframes (page-transition candidates) → PaddleOCR (ja+en) → JSON.

## Usage

```bash
cd packages/video-ocr
uv sync
uv run video-ocr ../../assets/zeta-20260416-002649.mp4
```

Output: `output/{video_stem}.json`

## Options

- `--sample-fps` frames sampled per second before dedup (default 2.0)
- `--phash-threshold` Hamming distance above which a frame is considered a new screen (default 6)
- `--lang` OCR language: `japan`, `en`, `ch`, ... (default `japan`; Japanese model also reads Latin)
- `--output-dir` where to write JSON (default `output/`)
