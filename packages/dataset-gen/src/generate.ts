import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { socialFeed } from './templates/social_feed.ts';
import { createSeed } from './templates/shared/seed.ts';

const TEMPLATES: Record<string, (s: ReturnType<typeof createSeed>) => string> = {
  social_feed: socialFeed,
};

const PKG_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const DATASET_ROOT = resolve(PKG_ROOT, '../../datasets');
const PAGES_DIR = resolve(DATASET_ROOT, 'pages');

async function main() {
  const count = Number(process.env.COUNT ?? 10);
  await mkdir(PAGES_DIR, { recursive: true });

  const templates = Object.keys(TEMPLATES);
  const entries: { id: string; template: string; path: string }[] = [];

  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length];
    const id = `${template}-${String(i).padStart(5, '0')}`;
    const seed = createSeed(`${template}:${i}`);
    const htmlStr = TEMPLATES[template](seed);
    const outPath = resolve(PAGES_DIR, `${id}.html`);
    await writeFile(outPath, htmlStr, 'utf8');
    entries.push({ id, template, path: outPath });
  }

  console.log(`generated ${entries.length} pages in ${PAGES_DIR}`);
  for (const e of entries.slice(0, 3)) console.log(`  ${e.id}`);
  if (entries.length > 3) console.log(`  ... (+${entries.length - 3} more)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
