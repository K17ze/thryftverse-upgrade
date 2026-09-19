import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// F04 — `src/` mixes node:test and vitest dialects. Rather than a hand-maintained
// include list (which had already drifted four files stale), the suite is derived
// from each file's test-framework import so a new vitest file can never be
// silently excluded.
const srcRoot = fileURLToPath(new URL('./src', import.meta.url));

function vitestFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      vitestFiles(path, out);
    } else if (entry.name.endsWith('.test.ts')) {
      const source = readFileSync(path, 'utf8');
      if (/from\s+['"]vitest['"]/.test(source)) {
        out.push(relative(srcRoot, path).split(sep).join('/'));
      }
    }
  }
  return out;
}

export default defineConfig({
  test: {
    include: vitestFiles(srcRoot).map((rel) => `src/${rel}`),
    exclude: ['dist/**', 'node_modules/**'],
    environment: 'node',
  },
});
