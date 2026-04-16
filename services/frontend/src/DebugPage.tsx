import { useCallback, useEffect, useRef, useState } from 'react';

const BACKEND_ORIGIN =
  typeof window !== 'undefined' && window.location.port === '5173'
    ? 'http://localhost:8787'
    : '';

type TextEntry = {
  text: string;
  confidence: number;
  bbox: [number, number][] | null;
};

type KeyframeData = {
  frame: number;
  timestamp: number;
  phash: string;
  texts: TextEntry[];
};

type OcrData = {
  video: string;
  meta: {
    fps: number;
    frame_count: number;
    duration_seconds: number;
    sample_fps: number;
    phash_threshold: number;
  };
  lang: string;
  variant: string;
  keyframes: KeyframeData[];
};

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function confColor(c: number) {
  if (c >= 0.95) return '#2a7';
  if (c >= 0.8) return '#b80';
  return '#c33';
}

function drawBboxes(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  texts: TextEntry[],
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  const rect = video.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // The video maintains aspect ratio inside the element (object-fit:contain).
  // Compute the actual rendered area and the letterbox/pillarbox offset.
  const videoAspect = vw / vh;
  const elemAspect = rect.width / rect.height;
  let renderW: number, renderH: number, offsetX: number, offsetY: number;
  if (videoAspect > elemAspect) {
    renderW = rect.width;
    renderH = rect.width / videoAspect;
    offsetX = 0;
    offsetY = (rect.height - renderH) / 2;
  } else {
    renderH = rect.height;
    renderW = rect.height * videoAspect;
    offsetX = (rect.width - renderW) / 2;
    offsetY = 0;
  }
  const sx = renderW / vw;
  const sy = renderH / vh;

  for (const t of texts) {
    if (!t.bbox) continue;
    const color = confColor(t.confidence);
    const pts = t.bbox.map(([x, y]) => [x * sx + offsetX, y * sy + offsetY] as const);

    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color + '18';
    ctx.fill();

    const labelY = Math.min(...pts.map(([, y]) => y));
    const labelX = Math.min(...pts.map(([x]) => x));
    const fontSize = Math.max(10, Math.min(14, 12 * sx));
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    const label = `${t.text}  ${(t.confidence * 100).toFixed(0)}%`;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(labelX, labelY - fontSize - 4, tw + 8, fontSize + 6);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, labelX + 4, labelY - 5);
  }
}

export function DebugPage({ stem }: { stem: string }) {
  const [data, setData] = useState<OcrData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeKf, setActiveKf] = useState<number | null>(null);
  const [showBbox, setShowBbox] = useState(true);
  const [expandedKf, setExpandedKf] = useState<Set<number>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/videos/${encodeURIComponent(stem)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json() as Promise<OcrData>;
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [stem]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !data) return;
    if (!showBbox || activeKf === null) {
      const ctx = canvas.getContext('2d');
      if (ctx) { canvas.width = 0; canvas.height = 0; }
      return;
    }
    drawBboxes(canvas, video, data.keyframes[activeKf].texts);
  }, [data, activeKf, showBbox]);

  useEffect(() => {
    redraw();
    const obs = new ResizeObserver(redraw);
    if (videoRef.current) obs.observe(videoRef.current);
    return () => obs.disconnect();
  }, [redraw]);

  const seekTo = (timestamp: number, kfIndex: number) => {
    setActiveKf(kfIndex);
    const el = videoRef.current;
    if (el) {
      el.currentTime = timestamp;
      el.pause();
    }
  };

  const toggleExpand = (idx: number) => {
    setExpandedKf((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (error) {
    return (
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <h1><a href="/" style={{ textDecoration: 'none', color: 'inherit' }}>ScreenDock</a> / debug</h1>
        <p style={{ color: 'crimson' }}>{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <p>loading {stem}…</p>
      </main>
    );
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20 }}>
        <a href="/" style={{ textDecoration: 'none', color: 'inherit' }}>ScreenDock</a>
        {' / '}
        <span style={{ color: '#666' }}>debug</span>
        {' / '}
        {stem}
      </h1>

      {/* meta */}
      <table style={{ fontSize: 13, color: '#555', marginBottom: 12, borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ paddingRight: 16 }}>video</td>
            <td><strong>{data.video}</strong></td>
          </tr>
          <tr>
            <td style={{ paddingRight: 16 }}>duration</td>
            <td>{data.meta.duration_seconds.toFixed(1)}s ({fmt(data.meta.duration_seconds)})</td>
          </tr>
          <tr>
            <td style={{ paddingRight: 16 }}>fps / frames</td>
            <td>{data.meta.fps.toFixed(2)} / {data.meta.frame_count}</td>
          </tr>
          <tr>
            <td style={{ paddingRight: 16 }}>OCR</td>
            <td>lang={data.lang} variant={data.variant}</td>
          </tr>
          <tr>
            <td style={{ paddingRight: 16 }}>extraction</td>
            <td>sample_fps={data.meta.sample_fps} phash_threshold={data.meta.phash_threshold}</td>
          </tr>
          <tr>
            <td style={{ paddingRight: 16 }}>keyframes</td>
            <td><strong>{data.keyframes.length}</strong></td>
          </tr>
        </tbody>
      </table>

      {/* video + bbox overlay */}
      <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
        <video
          ref={videoRef}
          src={`${BACKEND_ORIGIN}/api/assets/${data.video}`}
          controls
          preload="auto"
          onSeeked={redraw}
          style={{ width: '100%', maxHeight: '50vh', background: '#000', borderRadius: 8, display: 'block' }}
        />
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* keyframe timeline header */}
      <div style={{ margin: '12px 0 4px', fontSize: 13, color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{data.keyframes.length} keyframes — click to seek &amp; show bbox, expand for OCR detail</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={showBbox} onChange={(e) => setShowBbox(e.target.checked)} />
          bbox overlay
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {data.keyframes.map((kf, idx) => {
          const expanded = expandedKf.has(idx);
          const isActive = activeKf === idx;
          return (
            <div
              key={kf.frame}
              style={{
                border: isActive ? '2px solid #39f' : '1px solid #ddd',
                borderRadius: 6,
                padding: '6px 10px',
                background: isActive ? '#f0f6ff' : '#fafafa',
              }}
            >
              {/* summary row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '70px 70px 1fr 80px 40px',
                  gap: 8,
                  alignItems: 'center',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
                onClick={() => seekTo(kf.timestamp, idx)}
              >
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {fmt(kf.timestamp)}
                </span>
                <span style={{ color: '#888', fontSize: 11 }}>
                  f={kf.frame}
                </span>
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#444' }}
                  title={kf.texts.map((t) => t.text).join(' | ')}
                >
                  {kf.texts.slice(0, 5).map((t) => t.text).join(' · ') || '(no text)'}
                </span>
                <span style={{ color: '#888', fontSize: 12 }}>
                  {kf.texts.length} text(s)
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleExpand(idx); }}
                  style={{
                    background: 'none',
                    border: '1px solid #ccc',
                    borderRadius: 3,
                    cursor: 'pointer',
                    fontSize: 11,
                    padding: '1px 6px',
                  }}
                >
                  {expanded ? '-' : '+'}
                </button>
              </div>

              {/* expanded detail */}
              {expanded && (
                <div style={{ marginTop: 8, fontSize: 12, borderTop: '1px solid #eee', paddingTop: 6 }}>
                  <div style={{ color: '#999', marginBottom: 4 }}>
                    phash: <code>{kf.phash}</code>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: '#888', borderBottom: '1px solid #eee' }}>
                        <th style={{ padding: '2px 6px', width: 30 }}>#</th>
                        <th style={{ padding: '2px 6px' }}>text</th>
                        <th style={{ padding: '2px 6px', width: 60 }}>conf</th>
                        <th style={{ padding: '2px 6px', width: 200 }}>bbox</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kf.texts.map((t, ti) => (
                        <tr
                          key={ti}
                          style={{ borderBottom: '1px solid #f5f5f5' }}
                        >
                          <td style={{ padding: '2px 6px', color: '#bbb' }}>{ti}</td>
                          <td style={{ padding: '2px 6px' }}>{t.text}</td>
                          <td style={{ padding: '2px 6px', color: confColor(t.confidence), fontVariantNumeric: 'tabular-nums' }}>
                            {t.confidence.toFixed(3)}
                          </td>
                          <td style={{ padding: '2px 6px', fontFamily: 'monospace', fontSize: 10, color: '#999' }}>
                            {t.bbox
                              ? t.bbox.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(' ')
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
