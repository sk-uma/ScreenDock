import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { buildIndex, runSearch, type SearchIndex } from './search.ts';

const OCR_OUTPUT_DIR = resolve(
  import.meta.dirname,
  '../../../packages/video-ocr/output',
);

const ASSETS_DIR = resolve(
  import.meta.dirname,
  '../../../assets',
);

const app = new Hono();
app.use('*', logger());
app.use('/api/*', cors());

let indexPromise: Promise<SearchIndex> | null = null;
function getIndex() {
  indexPromise ??= buildIndex(OCR_OUTPUT_DIR).then((idx) => {
    console.log(`search index built: ${idx.size} text rows`);
    return idx;
  });
  return indexPromise;
}

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/videos', async (c) => {
  const files = await readdir(OCR_OUTPUT_DIR).catch(() => [] as string[]);
  const jsons = files.filter((f) => f.endsWith('.json'));
  const videos = await Promise.all(
    jsons.map(async (f) => {
      const raw = await readFile(resolve(OCR_OUTPUT_DIR, f), 'utf8');
      const data = JSON.parse(raw) as {
        video: string;
        meta: { duration_seconds: number; fps: number };
        keyframes: unknown[];
      };
      return {
        stem: f.replace(/\.json$/, ''),
        video: data.video,
        duration_seconds: data.meta.duration_seconds,
        fps: data.meta.fps,
        keyframe_count: data.keyframes.length,
      };
    }),
  );
  return c.json({ videos });
});

app.get('/api/videos/:stem', async (c) => {
  const stem = c.req.param('stem');
  if (!/^[A-Za-z0-9._-]+$/.test(stem)) return c.json({ error: 'bad stem' }, 400);
  const path = resolve(OCR_OUTPUT_DIR, `${stem}.json`);
  const raw = await readFile(path, 'utf8').catch(() => null);
  if (raw === null) return c.json({ error: 'not found' }, 404);
  return c.body(raw, 200, { 'content-type': 'application/json; charset=utf-8' });
});

app.get('/api/search', async (c) => {
  const q = c.req.query('q') ?? '';
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 30)));
  const index = await getIndex();
  const result = await runSearch(index, q, limit);
  return c.json(result);
});

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

app.get('/api/assets/:filename', async (c) => {
  const filename = c.req.param('filename');
  if (!/^[A-Za-z0-9._-]+$/.test(filename)) return c.json({ error: 'bad name' }, 400);
  const filePath = resolve(ASSETS_DIR, filename);
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat) return c.json({ error: 'not found' }, 404);

  const size = fileStat.size;
  const mime = MIME[extname(filename)] ?? 'application/octet-stream';
  const range = c.req.header('range');

  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    const start = match ? Number(match[1]) : 0;
    const end = match && match[2] ? Number(match[2]) : size - 1;
    return new Response(
      new ReadableStream({
        start(ctrl) {
          const rs = createReadStream(filePath, { start, end });
          rs.on('data', (chunk: string | Buffer) => ctrl.enqueue(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
          rs.on('end', () => ctrl.close());
          rs.on('error', (e) => ctrl.error(e));
        },
      }),
      {
        status: 206,
        headers: {
          'content-type': mime,
          'content-range': `bytes ${start}-${end}/${size}`,
          'content-length': String(end - start + 1),
          'accept-ranges': 'bytes',
        },
      },
    );
  }

  return new Response(
    new ReadableStream({
      start(ctrl) {
        const rs = createReadStream(filePath);
        rs.on('data', (chunk: string | Buffer) => ctrl.enqueue(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
        rs.on('end', () => ctrl.close());
        rs.on('error', (e) => ctrl.error(e));
      },
    }),
    {
      status: 200,
      headers: {
        'content-type': mime,
        'content-length': String(size),
        'accept-ranges': 'bytes',
      },
    },
  );
});

void getIndex();

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`backend listening on http://localhost:${port}`);
});
