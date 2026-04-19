# @screendock/dataset-gen

Synthetic OCR dataset generator. Renders HTML templates with varied layouts /
fonts / Japanese content via Playwright; the DOM is walked to emit perfectly
accurate text + bbox ground truth.

## Layout

```
datasets/                     (written to repo root, gitignored)
├── pages/                    generated HTML
├── screenshots/              captured PNGs
└── labels.jsonl              { id, image, viewport, labels: [{text, bbox}] }
```

## Usage

```bash
cd packages/dataset-gen
pnpm install
pnpm exec playwright install chromium      # first time only
pnpm run pipeline                          # generate + capture
# or individually:
COUNT=100 pnpm run generate
VIEWPORT_W=1080 VIEWPORT_H=2424 pnpm run capture
```

## Templates

- `social_feed` — Japanese SNS-style timeline with avatars, posts, like counts.

Each template is a `(seed) => html-string` function that consumes a
deterministic seeded RNG + Faker for reproducible variants.

## Ground truth extraction

Playwright walks every text node via `TreeWalker`, computes
`Range.getBoundingClientRect()`, and emits `{text, bbox}` pairs. Off-viewport
text and sub-pixel nodes are filtered out to match what the screenshot
actually shows.
