import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeDesignFile } from './design.ts';
import { designSocialFeed } from './designs/social_feed.ts';
import type { DesignDocument } from './types.ts';

const DESIGN_BUILDERS: Record<string, (seed: string) => DesignDocument> = {
  social_feed: designSocialFeed,
};

const PKG_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const DATASET_ROOT = resolve(PKG_ROOT, '../../datasets');
const DESIGNS_DIR = resolve(DATASET_ROOT, 'designs');

async function main() {
  const count = Number(process.env.COUNT ?? 10);
  await mkdir(DESIGNS_DIR, { recursive: true });

  const templates = Object.keys(DESIGN_BUILDERS);
  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length];
    const id = `${template}-${String(i).padStart(5, '0')}`;
    const doc = DESIGN_BUILDERS[template](`${template}:${i}`);
    await writeDesignFile(resolve(DESIGNS_DIR, `${id}.md`), doc);
  }
  console.log(`wrote ${count} DESIGN.md files to ${DESIGNS_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
