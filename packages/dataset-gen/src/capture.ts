import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium, type Page } from 'playwright';

const PKG_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const DATASET_ROOT = resolve(PKG_ROOT, '../../datasets');
const PAGES_DIR = resolve(DATASET_ROOT, 'pages');
const SCREENSHOTS_DIR = resolve(DATASET_ROOT, 'screenshots');
const LABELS_PATH = resolve(DATASET_ROOT, 'labels.jsonl');

const VIEWPORT = {
  width: Number(process.env.VIEWPORT_W ?? 1080),
  height: Number(process.env.VIEWPORT_H ?? 2424),
  deviceScaleFactor: 1,
};

type TextLabel = {
  text: string;
  bbox: [number, number, number, number]; // x1, y1, x2, y2
};

async function extractLabels(page: Page): Promise<TextLabel[]> {
  return page.evaluate(() => {
    const out: { text: string; bbox: [number, number, number, number] }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode as Text;
      const raw = n.textContent ?? '';
      const text = raw.trim();
      if (!text) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rect = range.getBoundingClientRect();
      range.detach();
      if (rect.width < 1 || rect.height < 1) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      out.push({
        text,
        bbox: [rect.left, rect.top, rect.right, rect.bottom],
      });
    }
    return out;
  });
}

async function main() {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });

  const files = (await readdir(PAGES_DIR))
    .filter((f) => f.endsWith('.html'))
    .sort();
  if (files.length === 0) {
    console.error('no pages to capture; run `pnpm -F @screendock/dataset-gen generate` first');
    process.exit(1);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const labelLines: string[] = [];

  try {
    for (const file of files) {
      const id = file.replace(/\.html$/, '');
      const pagePath = resolve(PAGES_DIR, file);
      const shotPath = resolve(SCREENSHOTS_DIR, `${id}.png`);

      const page = await context.newPage();
      await page.goto(pathToFileURL(pagePath).href, { waitUntil: 'networkidle' });
      const labels = await extractLabels(page);
      await page.screenshot({ path: shotPath, type: 'png' });
      await page.close();

      labelLines.push(
        JSON.stringify({
          id,
          image: shotPath,
          viewport: VIEWPORT,
          labels,
        }),
      );
      console.log(`  ${id}  ${labels.length} labels`);
    }
  } finally {
    await browser.close();
  }

  await writeFile(LABELS_PATH, labelLines.join('\n') + '\n', 'utf8');
  console.log(`wrote ${LABELS_PATH}  (${labelLines.length} entries)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
