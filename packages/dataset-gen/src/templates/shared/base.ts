import type { Seed } from './seed.ts';

export const html = (strings: TemplateStringsArray, ...values: unknown[]): string => {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) out += String(values[i]);
  }
  return out;
};

export function baseHead(seed: Seed, extra = ''): string {
  return html`
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; font-family: ${seed.fontFamily()}; }
      img { display: block; }
      ${extra}
    </style>
  `;
}
