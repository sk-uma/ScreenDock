import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readDesignFile } from './design.ts';
import { socialFeed } from './templates/social_feed.ts';
import type { Design } from './types.ts';

const PKG_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const DATASET_ROOT = resolve(PKG_ROOT, '../../datasets');
const DESIGNS_DIR = resolve(DATASET_ROOT, 'designs');
const PAGES_DIR = resolve(DATASET_ROOT, 'pages');

function renderDesign(design: Design): string {
  switch (design.template) {
    case 'social_feed':
      return socialFeed(design);
    default:
      throw new Error(`Unknown template: ${(design as { template: string }).template}`);
  }
}

async function main() {
  await mkdir(PAGES_DIR, { recursive: true });
  const files = (await readdir(DESIGNS_DIR)).filter((f) => f.endsWith('.md')).sort();
  if (files.length === 0) {
    console.error('no designs found; run `pnpm -F @screendock/dataset-gen generate-designs` first');
    process.exit(1);
  }
  for (const f of files) {
    const id = f.replace(/\.md$/, '');
    const doc = await readDesignFile(resolve(DESIGNS_DIR, f));
    const htmlStr = renderDesign(doc.design);
    await writeFile(resolve(PAGES_DIR, `${id}.html`), htmlStr, 'utf8');
  }
  console.log(`rendered ${files.length} HTML files to ${PAGES_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
