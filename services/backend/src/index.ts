import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OCR_OUTPUT_DIR = resolve(
  import.meta.dirname,
  '../../../packages/video-ocr/output',
);

const app = new Hono();
app.use('*', logger());
app.use('/api/*', cors());

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

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`backend listening on http://localhost:${port}`);
});
