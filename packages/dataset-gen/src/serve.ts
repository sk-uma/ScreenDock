/** Tiny static server for the datasets/ directory so generated HTML,
 * designs, and screenshots can be browsed while iterating. */

import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const DATASET_ROOT = resolve(PKG_ROOT, '../../datasets');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'application/jsonl; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

async function listing(rel: string, abs: string): Promise<string> {
  const entries = (await readdir(abs, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const items = entries
    .map((e) => {
      const href = (rel + '/' + e.name).replace(/\/+/g, '/');
      const label = e.isDirectory() ? e.name + '/' : e.name;
      return `<li><a href="${esc(href)}">${esc(label)}</a></li>`;
    })
    .join('');
  return `<!doctype html><meta charset="utf-8"><title>${esc(rel || '/')}</title>
<style>body{font:14px/1.5 system-ui;padding:16px;max-width:800px} li{margin:2px 0}</style>
<h1>${esc(rel || '/')}</h1>
<ul>${rel === '/' ? '' : '<li><a href="../">..</a></li>'}${items}</ul>`;
}

const port = Number(process.env.PORT ?? 4000);
createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const abs = resolve(DATASET_ROOT, '.' + rel);
    if (!abs.startsWith(DATASET_ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const s = await stat(abs).catch(() => null);
    if (!s) {
      res.writeHead(404).end('not found');
      return;
    }
    if (s.isDirectory()) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(await listing(rel, abs));
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(abs)] ?? 'application/octet-stream' });
    res.end(await readFile(abs));
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
}).listen(port, () => {
  console.log(`datasets: http://localhost:${port}/`);
  console.log(`  designs: http://localhost:${port}/designs/`);
  console.log(`  pages:   http://localhost:${port}/pages/`);
  console.log(`  shots:   http://localhost:${port}/screenshots/`);
});
