import { create, insertMultiple, search } from '@orama/orama';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Japanese full-text needs token overlap shorter than typical word length.
 * Bigram gives hits on 2-char queries (common in JP UI: "設定", "ホーム") and
 * avoids the cost of a morphological analyzer. */
export function bigramTokenize(raw: string): string[] {
  const norm = raw.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  if (norm.length === 0) return [];
  if (norm.length === 1) return [norm];
  const out: string[] = [];
  for (let i = 0; i < norm.length - 1; i++) out.push(norm.slice(i, i + 2));
  return out;
}

const schema = {
  video: 'string',
  stem: 'string',
  timestamp: 'number',
  phash: 'string',
  text: 'string',
} as const;

type OcrJson = {
  video: string;
  keyframes: Array<{
    frame: number;
    timestamp: number;
    phash: string;
    texts: Array<{ text: string; confidence: number }>;
  }>;
};

type SearchDb = Awaited<ReturnType<typeof createDb>>;

function createDb() {
  return create({
    schema,
    components: {
      tokenizer: {
        language: 'en',
        normalizationCache: new Map<string, string>(),
        tokenize: (raw: string) => bigramTokenize(raw),
      },
    },
  });
}

export type SearchIndex = {
  db: SearchDb;
  size: number;
};

export async function buildIndex(ocrOutputDir: string): Promise<SearchIndex> {
  const db = createDb();
  const files = await readdir(ocrOutputDir).catch(() => [] as string[]);
  const docs: Array<{
    id: string;
    video: string;
    stem: string;
    timestamp: number;
    phash: string;
    text: string;
  }> = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const stem = file.replace(/\.json$/, '');
    const raw = await readFile(resolve(ocrOutputDir, file), 'utf8');
    const data = JSON.parse(raw) as OcrJson;
    for (const kf of data.keyframes) {
      for (const [i, t] of kf.texts.entries()) {
        const text = t.text?.trim();
        if (!text) continue;
        docs.push({
          id: `${stem}#${kf.frame}#${i}`,
          video: data.video,
          stem,
          timestamp: kf.timestamp,
          phash: kf.phash,
          text,
        });
      }
    }
  }

  if (docs.length > 0) await insertMultiple(db, docs);
  return { db, size: docs.length };
}

export type SearchHit = {
  id: string;
  score: number;
  video: string;
  stem: string;
  timestamp: number;
  phash: string;
  text: string;
};

export async function runSearch(
  index: SearchIndex,
  query: string,
  limit = 30,
): Promise<{ query: string; hits: SearchHit[]; count: number; elapsed_ms: number }> {
  const q = query.trim();
  if (!q) return { query: q, hits: [], count: 0, elapsed_ms: 0 };

  // threshold:0 → all query bigrams must be present (AND). Keeps precision
  // high; with OR a 2-char query like "設定" matches every doc with either
  // bigram slice.
  const result = await search(index.db, {
    term: q,
    properties: ['text'],
    limit,
    threshold: 0,
  });

  const hits: SearchHit[] = result.hits.map((h) => ({
    id: String(h.id),
    score: h.score,
    video: h.document.video as string,
    stem: h.document.stem as string,
    timestamp: h.document.timestamp as number,
    phash: h.document.phash as string,
    text: h.document.text as string,
  }));
  return {
    query: q,
    hits,
    count: result.count,
    elapsed_ms: result.elapsed.raw / 1_000_000,
  };
}
