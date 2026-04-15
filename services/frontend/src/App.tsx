import { useEffect, useState } from 'react';

type VideoSummary = {
  stem: string;
  video: string;
  duration_seconds: number;
  fps: number;
  keyframe_count: number;
};

export function App() {
  const [videos, setVideos] = useState<VideoSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/videos')
      .then((r) => r.json())
      .then((d: { videos: VideoSummary[] }) => setVideos(d.videos))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>ScreenDock</h1>
      {error && <p style={{ color: 'crimson' }}>error: {error}</p>}
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
    </main>
  );
}
