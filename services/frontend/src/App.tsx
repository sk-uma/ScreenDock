import { useEffect, useRef, useState } from 'react';

type VideoSummary = {
  stem: string;
  video: string;
  duration_seconds: number;
  fps: number;
  keyframe_count: number;
};

type SearchHit = {
  id: string;
  score: number;
  video: string;
  stem: string;
  timestamp: number;
  phash: string;
  text: string;
};

type SearchResponse = {
  query: string;
  hits: SearchHit[];
  count: number;
  elapsed_ms: number;
};

function formatTimestamp(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const BACKEND_ORIGIN =
  typeof window !== 'undefined' && window.location.port === '5173'
    ? 'http://localhost:8787'
    : '';

function VideoPlayer({ video, timestamp }: { video: string; timestamp: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const seek = () => {
      el.currentTime = timestamp;
    };
    el.addEventListener('loadedmetadata', seek);
    if (el.readyState >= 1) seek();
    return () => el.removeEventListener('loadedmetadata', seek);
  }, [video, timestamp]);

  return (
    <>
      <video
        ref={ref}
        src={`${BACKEND_ORIGIN}/api/assets/${video}`}
        controls
        autoPlay
        preload="auto"
        onError={() => {
          const el = ref.current;
          const code = el?.error?.code;
          const msg = el?.error?.message ?? 'unknown';
          setVideoError(`Media error (code=${code}): ${msg}`);
        }}
        style={{ width: '100%', maxHeight: '60vh', background: '#000', borderRadius: 8 }}
      />
      {videoError && <p style={{ color: 'crimson', fontSize: 13 }}>{videoError}</p>}
    </>
  );
}

export function App() {
  const [videos, setVideos] = useState<VideoSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ video: string; timestamp: number } | null>(null);

  useEffect(() => {
    fetch('/api/videos')
      .then((r) => r.json())
      .then((d: { videos: VideoSummary[] }) => setVideos(d.videos))
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResult(null);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}&limit=30`, { signal: ctrl.signal })
        .then((r) => r.json() as Promise<SearchResponse>)
        .then((d) => {
          setSearchResult(d);
          setSearching(false);
        })
        .catch((e) => {
          if (e.name !== 'AbortError') setError(String(e));
          setSearching(false);
        });
    }, 150);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [query]);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1>ScreenDock</h1>

      <input
        type="search"
        placeholder="動画の中の文字を検索 (例: 設定, ランキング)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: '100%',
          padding: '10px 14px',
          fontSize: 16,
          border: '1px solid #999',
          borderRadius: 8,
          boxSizing: 'border-box',
        }}
      />

      {error && <p style={{ color: 'crimson' }}>error: {error}</p>}

      {selected && (
        <section style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#666' }}>
              {selected.video} · {formatTimestamp(selected.timestamp)}
            </span>
            <button
              onClick={() => setSelected(null)}
              style={{
                background: 'none',
                border: '1px solid #ccc',
                borderRadius: 4,
                padding: '2px 10px',
                cursor: 'pointer',
              }}
            >
              close
            </button>
          </div>
          <VideoPlayer video={selected.video} timestamp={selected.timestamp} />
        </section>
      )}

      {query.trim() && (
        <section style={{ marginTop: 16 }}>
          {searching && !searchResult && <p>searching…</p>}
          {searchResult && (
            <>
              <p style={{ color: '#666', fontSize: 13 }}>
                {searchResult.count} hit(s) · {searchResult.elapsed_ms.toFixed(2)}ms
              </p>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {searchResult.hits.map((h) => (
                  <li
                    key={h.id}
                    onClick={() => setSelected({ video: h.video, timestamp: h.timestamp })}
                    style={{
                      borderBottom: '1px solid #eee',
                      padding: '8px 4px',
                      display: 'grid',
                      gridTemplateColumns: '80px 1fr',
                      gap: 12,
                      alignItems: 'baseline',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f5')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: '#555' }}>
                      {formatTimestamp(h.timestamp)}
                    </span>
                    <span>{h.text}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {!query.trim() && !selected && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16 }}>ingested videos</h2>
          {videos === null && !error && <p>loading…</p>}
          {videos && videos.length === 0 && <p>no OCR output yet.</p>}
          {videos && videos.length > 0 && (
            <ul>
              {videos.map((v) => (
                <li key={v.stem}>
                  <strong>{v.video}</strong> · {v.duration_seconds.toFixed(1)}s ·{' '}
                  {v.keyframe_count} keyframes
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
