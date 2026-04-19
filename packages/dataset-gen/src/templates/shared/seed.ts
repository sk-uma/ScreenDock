import { Faker, ja, en, base } from '@faker-js/faker';
import seedrandom from 'seedrandom';

const FONT_FAMILIES = [
  '"Yu Gothic Medium", "Yu Gothic", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif',
  '"Meiryo", "Yu Gothic", sans-serif',
  '"Noto Sans JP", "Yu Gothic", sans-serif',
  '"Hiragino Mincho ProN", "Yu Mincho", serif',
];

export type Seed = ReturnType<typeof createSeed>;

export function createSeed(rngSeed: string) {
  const rng = seedrandom(rngSeed);
  const faker = new Faker({ locale: [ja, en, base] });
  faker.seed(Math.floor(rng() * 2 ** 32));

  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const float = (lo: number, hi: number) => lo + rng() * (hi - lo);

  return {
    rng,
    int,
    float,
    pick,
    jaName: () => faker.person.lastName() + faker.person.firstName(),
    jaHandle: () => '@' + faker.internet.username().toLowerCase(),
    jaSentence: (min = 8, max = 40) => faker.lorem.sentence({ min, max }),
    enWord: () => faker.word.sample(),
    fontFamily: () => pick(FONT_FAMILIES),
    // picsum with a deterministic seed so each run is reproducible.
    picsumUrl: (w: number, h: number) =>
      `https://picsum.photos/seed/${faker.string.alphanumeric(8)}/${w}/${h}`,
    timestamp: () => {
      const ts = faker.date.recent({ days: 30 });
      const m = String(ts.getMonth() + 1).padStart(2, '0');
      const d = String(ts.getDate()).padStart(2, '0');
      const hh = String(ts.getHours()).padStart(2, '0');
      const mm = String(ts.getMinutes()).padStart(2, '0');
      return `${m}/${d} ${hh}:${mm}`;
    },
  };
}
