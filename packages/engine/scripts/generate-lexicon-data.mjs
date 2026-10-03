// Generates a runtime-neutral, embedded copy of the /lexicon JSON data so the
// deterministic generation core can run in Deno/Supabase Edge without fs access.
//
// The /lexicon/*.json files remain the single source of truth; this script only
// derives `src/generation/lexicon-data.ts` from them.
//
// Usage: npm run generate:lexicon -w @dotcomseekr/engine
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const lexiconDir = join(here, '..', '..', '..', 'lexicon');
const outFile = join(here, '..', 'src', 'generation', 'lexicon-data.ts');

// Order here defines the emitted object order (kept stable for clean diffs).
const FILES = {
  synonyms: 'base_synonyms.json',
  related: 'base_related.json',
  rhymes: 'base_rhymes.json',
  phonetics: 'base_phonetics.json',
  toneGlue: 'tone_glue.json',
  stopwords: 'stopwords.json',
  blocklist: 'blocklist.json',
};

async function main() {
  const data = {};
  for (const [key, fileName] of Object.entries(FILES)) {
    const raw = await readFile(join(lexiconDir, fileName), 'utf-8');
    data[key] = JSON.parse(raw);
  }

  const banner = [
    '// AUTO-GENERATED FILE. DO NOT EDIT BY HAND.',
    '// Source: /lexicon/*.json',
    '// Regenerate with: npm run generate:lexicon -w @dotcomseekr/engine',
    "import type { LexiconData } from './types.ts';",
    '',
  ].join('\n');

  const body = `export const LEXICON_DATA: LexiconData = ${JSON.stringify(data, null, 2)};\n`;

  await writeFile(outFile, `${banner}\n${body}`, 'utf-8');
  console.log(`Wrote ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
