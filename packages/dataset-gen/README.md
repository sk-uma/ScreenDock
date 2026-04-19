# @screendock/dataset-gen

Synthetic OCR dataset generator. Three stages:

```
generate-designs  →  generate-html  →  capture
   ↓                    ↓                ↓
 DESIGN.md           pages/*.html    screenshots/*.png
 (reviewable         (deterministic   + labels.jsonl
  intent)             rendering)       (text + bbox)
```

`DESIGN.md` decouples *what* a page is (reviewable YAML + prose) from
*how* it renders (pure function from design to HTML), so designs can be
hand-edited or LLM-generated later without touching the renderer.

## Layout

```
datasets/                     (repo root, gitignored)
├── designs/                  DESIGN.md per page (YAML frontmatter + summary)
├── pages/                    rendered HTML
├── screenshots/              captured PNG
└── labels.jsonl              { id, image, viewport, labels: [{text, bbox}] }
```

## Usage

```bash
cd packages/dataset-gen
pnpm install
PLAYWRIGHT_BROWSERS_PATH=$(pwd)/.playwright-browsers pnpm exec playwright install chromium

COUNT=100 pnpm generate-designs
pnpm generate-html
VIEWPORT_W=1080 VIEWPORT_H=2424 pnpm capture

# or all three in one shot:
pnpm pipeline
```

## DESIGN.md format

```markdown
---
template: social_feed
theme: dark
font: '"Yu Gothic Medium", sans-serif'
header: ホーム
posts:
  - user: 野村颯真
    handle: '@9ni9md.i6nleo'
    time: 04/04 20:26
    body: へいがい 素材 警官...
    likes: 7753
    reposts: 348
    avatar_seed: '2070702310'
---

# social_feed (dark)
Japanese SNS-style timeline with 12 posts.
```

The frontmatter is the authoritative source — edit it and re-run
`generate-html` + `capture` to see the effect. The prose section is
free-form; nothing parses it.

## Templates

- `social_feed` — Japanese SNS timeline, three themes (light/dim/dark).

## Adding a template

1. Define a `FooDesign` type in `src/types.ts`.
2. Write `src/designs/foo.ts` — `designFoo(seed): DesignDocument`.
3. Write `src/templates/foo.ts` — `foo(design: FooDesign): string`.
4. Register in `DESIGN_BUILDERS` (generate-designs.ts) and
   `renderDesign` (generate-html.ts).
