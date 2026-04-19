import { baseHead, html } from './shared/base.ts';
import type { Seed } from './shared/seed.ts';
import type { SocialFeedDesign } from '../types.ts';

const THEME_COLORS: Record<SocialFeedDesign['theme'], {
  bg: string;
  fg: string;
  mute: string;
  border: string;
}> = {
  light: { bg: '#ffffff', fg: '#0f1419', mute: '#536471', border: '#eff3f4' },
  dim:   { bg: '#15202b', fg: '#ffffff', mute: '#8899a6', border: '#38444d' },
  dark:  { bg: '#000000', fg: '#e7e9ea', mute: '#71767b', border: '#2f3336' },
};

function picsum(avatarSeed: string, w: number, h: number): string {
  return `https://picsum.photos/seed/${avatarSeed}/${w}/${h}`;
}

export function socialFeed(design: SocialFeedDesign, _seed?: Seed): string {
  const c = THEME_COLORS[design.theme];

  const css = html`
    body { background: ${c.bg}; color: ${c.fg}; font-family: ${design.font}; }
    header {
      position: sticky; top: 0; padding: 14px 16px;
      font-weight: 700; font-size: 20px;
      background: ${c.bg}; border-bottom: 1px solid ${c.border};
    }
    ul.feed { list-style: none; margin: 0; padding: 0; }
    li.post { display: grid; grid-template-columns: 56px 1fr;
      gap: 12px; padding: 14px 16px;
      border-bottom: 1px solid ${c.border}; }
    .avatar { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
    .line1 { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
    .user { font-weight: 700; }
    .handle, .time { color: ${c.mute}; font-size: 14px; }
    .body { margin: 4px 0 8px; white-space: pre-wrap; line-height: 1.4; }
    .stats { display: flex; gap: 24px; color: ${c.mute}; font-size: 13px; }
    .stat { display: flex; gap: 4px; align-items: center; }
  `;

  return html`<!doctype html>
<html lang="ja">
<head>${baseHead({ fontFamily: () => design.font } as Seed, css)}</head>
<body>
  <header>${design.header}</header>
  <ul class="feed">
    ${design.posts
      .map(
        (p) => html`
      <li class="post">
        <img class="avatar" src="${picsum(p.avatar_seed, 96, 96)}" />
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
