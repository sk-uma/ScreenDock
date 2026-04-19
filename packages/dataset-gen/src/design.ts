import { readFile, writeFile } from 'node:fs/promises';
import YAML from 'yaml';

import type { Design, DesignDocument } from './types.ts';

/** Serialize a DesignDocument as Markdown with YAML frontmatter. */
export function stringifyDesign(doc: DesignDocument): string {
  const frontmatter = YAML.stringify(doc.design).trimEnd();
  return `---\n${frontmatter}\n---\n\n${doc.summary}\n`;
}

/** Parse a DESIGN.md produced by stringifyDesign. */
export async function readDesignFile(path: string): Promise<DesignDocument> {
  const raw = await readFile(path, 'utf8');
  return parseDesign(raw);
}

export function parseDesign(raw: string): DesignDocument {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!match) throw new Error('DESIGN.md missing frontmatter');
  const design = YAML.parse(match[1]) as Design;
  return { design, summary: match[2].trim() };
}

export async function writeDesignFile(path: string, doc: DesignDocument): Promise<void> {
  await writeFile(path, stringifyDesign(doc), 'utf8');
}
