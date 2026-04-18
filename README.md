# ScreenDock

Make screen recordings and screenshots searchable. Extract text from every
screen transition in a video, index it, and jump back to the exact moment a
phrase appeared.

## What it does

1. **Ingest** — `packages/video-ocr` walks a video, samples frames at a fixed
   time interval, deduplicates near-identical frames with perceptual hashing,
   and runs OCR on whatever survives. Output is a JSON index with every text
   line, its bounding box, confidence, and the exact PTS timestamp.
2. **Serve** — `services/backend` (Hono on Node) reads those JSONs, builds an
   in-memory bigram full-text index via Orama, and exposes `/api/search`,
   `/api/videos`, `/api/videos/:stem`, and range-supported video streaming at
   `/api/assets/:filename`.
3. **Browse** — `services/frontend` (Vite + React) is a search box and a
   result list; clicking a hit opens the video seeked to the matching
   timestamp. `/debug/:stem` renders every keyframe with the detected bbox
   overlay, color-coded by OCR confidence.

## Repo layout

```
ScreenDock/
├── assets/                       screen recordings to ingest
├── packages/
│   └── video-ocr/                Python, uv-managed — OCR pipeline + CLI
├── services/
│   ├── backend/                  Hono API + Orama search
│   └── frontend/                 Vite + React UI
├── turbo.json                    turborepo task graph
├── pnpm-workspace.yaml           services/* workspace
└── .npmrc                        pnpm store/state inside repo
```

## Getting started

Prerequisites: Node ≥22, pnpm ≥10, uv ≥0.6, optional NVIDIA GPU + driver
for `--engine ppocr-vl`.

```bash
# 1. Install JS deps
pnpm install

# 2. Install Python deps (CPU default)
cd packages/video-ocr && uv sync --extra cpu
# or, with GPU: uv sync --extra gpu

# 3. Run OCR on a video
UV_CACHE_DIR=./.uv-cache uv run video-ocr run \
  ../../assets/zeta-20260416-002649.mp4 \
  --sample-fps 1.0 --phash-threshold 8

# 4. Start the app
cd ../..
pnpm dev          # backend :8787, frontend :5173
```

Open <http://localhost:5173> and search. Visit `/debug/<video-stem>` for the
inspector view.

### Environment notes

- `$HOME` read-only? The Python side redirects every third-party cache
  (paddlex, huggingface, xdg) into `packages/video-ocr/.cache/` at import
  time. The JS side pins pnpm's store/state to the repo via `.npmrc`.
- The Vite dev server proxies `/api/*` to `:8787`, but `<video>` sources go
  directly to `localhost:8787` to bypass proxy buffering of large streams.

## OCR engines

Two engines share the same JSON output schema:

| engine | model | bbox | size | speed (CPU) | quality |
|---|---|---|---|---|---|
| `ppocr` *(default)* | PP-OCRv5 mobile | per-line quad | ~150 MB | fast | good for clean UI text |
| `ppocr-vl` | PaddleOCR-VL 1.5 (0.9B VLM) | per-block quad | ~2.6 GB | slow (needs GPU) | SOTA; handles noisy / dense layouts |

```bash
# Full run, VLM + GPU
uv run video-ocr run video.mp4 --engine ppocr-vl --device gpu:0

# Quick single-frame sanity check
uv run video-ocr run video.mp4 -n 1

# Render one frame (or an existing image) with bbox overlay as PNG
uv run video-ocr preview video.mp4 --at 30.0 -o frame.png
uv run video-ocr preview screenshot.png -o annotated.png
```

## Scripts

Root `pnpm` scripts are routed through Turborepo:

```bash
pnpm dev              # run backend + frontend (persistent)
pnpm build            # build everything (cached)
pnpm typecheck        # tsc across workspaces (cached)
pnpm dev:backend      # backend only
pnpm dev:frontend     # frontend only
```

## API

- `GET /api/health` — `{ok: true}`
- `GET /api/videos` — summary of every OCR'd video
- `GET /api/videos/:stem` — full OCR JSON for one video
- `GET /api/search?q=&limit=` — bigram full-text search; AND over bigrams
- `GET /api/assets/:filename` — video stream with HTTP Range support

## Data model

Each OCR JSON (`packages/video-ocr/output/<stem>.json`):

```jsonc
{
  "video": "zeta-20260416-002649.mp4",
  "meta": { "fps": 19.5, "duration_seconds": 117.0, "frame_count": 2281,
            "sample_fps": 1.0, "phash_threshold": 8 },
  "engine": "ppocr",
  "lang": "japan",
  "variant": "mobile",
  "keyframes": [
    {
      "frame": 57,
      "timestamp": 1.008,                        // container PTS, matches browser currentTime
      "phash": "85ad7a5a5ac2a52d",               // for dedup
      "texts": [
        { "text": "ホーム", "confidence": 1.0,
          "bbox": [[10,20],[100,20],[100,50],[10,50]] }
      ]
    }
  ]
}
```
