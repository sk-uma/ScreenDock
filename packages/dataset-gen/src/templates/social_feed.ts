import { baseHead, html } from './shared/base.ts';
import type { Seed } from './shared/seed.ts';

export function socialFeed(seed: Seed): string {
  const posts = Array.from({ length: seed.int(6, 12) }, () => ({
    user: seed.jaName(),
    handle: seed.jaHandle(),
    time: seed.timestamp(),
    body: seed.jaSentence(12, 60),
    likes: seed.int(0, 9999),
    reposts: seed.int(0, 999),
    avatar: seed.picsumUrl(96, 96),
  }));

  const bg = seed.pick(['#ffffff', '#0f1419', '#15202b']);
  const fg = bg === '#ffffff' ? '#0f1419' : '#ffffff';
  const mute = bg === '#ffffff' ? '#536471' : '#8899a6';
  const border = bg === '#ffffff' ? '#eff3f4' : '#38444d';

  const css = html`
    body { background: ${bg}; color: ${fg}; }
    header {
      position: sticky; top: 0; padding: 14px 16px;
      font-weight: 700; font-size: 20px;
      background: ${bg}; border-bottom: 1px solid ${border};
    }
    ul.feed { list-style: none; margin: 0; padding: 0; }
    li.post { display: grid; grid-template-columns: 56px 1fr;
      gap: 12px; padding: 14px 16px;
      border-bottom: 1px solid ${border}; }
    .avatar { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
    .line1 { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
    .user { font-weight: 700; }
    .handle, .time { color: ${mute}; font-size: 14px; }
    .body { margin: 4px 0 8px; white-space: pre-wrap; line-height: 1.4; }
    .stats { display: flex; gap: 24px; color: ${mute}; font-size: 13px; }
    .stat { display: flex; gap: 4px; align-items: center; }
  `;

  return html`<!doctype html>
<html lang="ja">
<head>${baseHead(seed, css)}</head>
<body>
  <header>ホーム</header>
  <ul class="feed">
    ${posts
      .map(
        (p) => html`
      <li class="post">
        <img class="avatar" src="${p.avatar}" />
        <div>
          <div class="line1">
            <span class="user">${p.user}</span>
            <span class="handle">${p.handle}</span>
            <span class="time">・${p.time}</span>
          </div>
          <p class="body">${p.body}</p>
          <div class="stats">
            <span class="stat">♡ ${p.likes}</span>
            <span class="stat">↻ ${p.reposts}</span>
          </div>
        </div>
      </li>`,
      )
      .join('')}
  </ul>
</body>
</html>`;
}
