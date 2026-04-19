import { createSeed } from '../templates/shared/seed.ts';
import type { DesignDocument, SocialFeedDesign } from '../types.ts';

export function designSocialFeed(rngSeed: string): DesignDocument {
  const seed = createSeed(rngSeed);

  const theme = seed.pick(['light', 'dim', 'dark'] as const);
  const postCount = seed.int(6, 12);
  const posts = Array.from({ length: postCount }, () => ({
    user: seed.jaName(),
    handle: seed.jaHandle(),
    time: seed.timestamp(),
    body: seed.jaSentence(12, 60),
    likes: seed.int(0, 9999),
    reposts: seed.int(0, 999),
    avatar_seed: String(Math.floor(seed.rng() * 2 ** 31)).padStart(8, '0'),
  }));

  const design: SocialFeedDesign = {
    template: 'social_feed',
    theme,
    font: seed.fontFamily(),
    header: 'ホーム',
    posts,
  };

  const summary = [
    `# social_feed (${theme})`,
    '',
    `Japanese SNS-style timeline with **${postCount}** posts.`,
    `Seed: \`${rngSeed}\`.`,
    '',
    'Drives rendering via `templates/social_feed.ts`.',
  ].join('\n');

  return { design, summary };
}
