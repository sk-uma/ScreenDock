# video-ocr

OCR pipeline for ScreenDock. Walks a video, extracts timestamped keyframes
(perceptual-hash deduped so near-identical frames collapse), runs OCR on
each, and writes a JSON index with text + bbox + confidence per line.

## Install

```bash
cd packages/video-ocr
uv sync --extra cpu      # CPU
# or
uv sync --extra gpu      # paddlepaddle-gpu 3.3+ (CUDA 13 wheel)
```

The GPU extra pulls `paddlepaddle-gpu` from paddle's `cu130` index and
bundles CUDA 13 runtime libs, so you only need the NVIDIA driver on the
host (Windows side for WSL2).

`$HOME` read-only? No action needed — the package redirects `PADDLE_PDX_CACHE_HOME`, `HF_HOME`, and friends into `./.cache/` at import time.

## Commands

```bash
uv run video-ocr --help
```

### `run` — full pipeline

```bash
uv run video-ocr run <video> [OPTIONS]
```

| option | default | what it does |
|---|---|---|
| `--sample-fps` | 2.0 | frames sampled per second before dedup |
| `--phash-threshold` | 6 | Hamming distance for "this is a new screen" |
| `--engine` | `ppocr` | `ppocr` (PP-OCRv5 mobile) or `ppocr-vl` (PaddleOCR-VL 1.5) |
| `--variant` | `mobile` | `mobile`/`server`, applies to `ppocr` only |
| `--device` | `cpu` | `cpu` / `gpu:0` / `xpu` / `dcu` |
| `--lang` | `japan` | OCR language (Japanese model also reads Latin) |
| `-n/--max-keyframes` | none | stop after N keyframes (quick sanity checks) |
| `-o/--output-dir` | `output/` | where the JSON lands |

### `preview` — single frame, PNG output

```bash
uv run video-ocr preview <video-or-image> [OPTIONS]
```

Input can be a video (seek to `--at`) or an image file
(`.png/.jpg/.webp/.bmp/.tif`). Writes a PNG with bounding boxes drawn,
color-coded by OCR confidence (green ≥95%, amber ≥80%, red <80%), and
prints the numbered text list to stdout.

```bash
uv run video-ocr preview video.mp4 --at 30.0 -o frame.png
uv run video-ocr preview screenshot.png --engine ppocr-vl --device gpu:0 -o out.png
```

## Engines

| | `ppocr` | `ppocr-vl` |
|---|---|---|
| model | PP-OCRv5 mobile | PaddleOCR-VL 1.5 (PP-DocLayout-V3 + 0.9B VLM) |
| size | ~150 MB | ~2.6 GB |
| bbox | per-line (4-point quad) | per-block (axis-aligned, expanded to quad) |
| CPU speed | ~0.5s / frame | ~5–20s / frame |
| GPU speed | ~0.1s / frame | ~0.3–1s / frame |
| OmniDocBench 1.5 | — | 94.5 (SOTA-class) |

Both engines emit the same `{text, confidence, bbox}` schema so the search
index and debug UI are engine-agnostic.

## Output schema

```jsonc
{
  "video": "zeta-20260416-002649.mp4",
  "meta": { "fps": 19.5, "duration_seconds": 117.0, "frame_count": 2281,
            "sample_fps": 1.0, "phash_threshold": 8 },
  "engine": "ppocr",
  "keyframes": [
    {
      "frame": 57,
      "timestamp": 1.008,       // container PTS
      "phash": "85ad7a5a5ac2a52d",
      "texts": [
        { "text": "ホーム", "confidence": 1.0,
          "bbox": [[x1,y1],[x2,y1],[x2,y2],[x1,y2]],
          "label": "text"       // ppocr-vl only
        }
      ]
    }
  ]
}
```

## Implementation notes

- **VFR-safe timestamps.** `cap.get(CAP_PROP_POS_MSEC)` is read *before*
  each `cap.read()` to capture the container PTS, and sampling is driven
  by elapsed time rather than a frame-count step. Nominal `CAP_PROP_FPS`
  can drift multiple seconds on VFR recordings.
- **Streaming extraction.** `iter_keyframes` yields one frame at a time
  and drops the image reference after OCR, so RAM stays flat on long
  videos (tested fine with 2h+ recordings).
- **mkldnn off by default.** paddlepaddle 3.x oneDNN crashes on some
  CPUs (`ConvertPirAttribute2RuntimeAttribute`); `enable_mkldnn=False`
  is always passed to keep inference working on CPU-only hosts.
- **Paddle device pin.** PaddleOCR-VL's VL recognizer inherits `gpu:0`
  even when the pipeline is constructed with `device='cpu'`; we call
  `paddle.device.set_device(device)` before instantiation to fix that.
