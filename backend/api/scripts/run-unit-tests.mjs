// Unit-test runner for the node:test suite (F04).
//
// `src/` contains two test dialects that must never share a runner:
//   - node:test files  → executed here via `node --import tsx --test`
//   - vitest files     → executed via `npm run test:vitest`
// `src/integration/` is a separately-selectable suite (test:integration).
// Files are classified by their test-framework import, so adding a test to
// the wrong glob is impossible — the dialect marker in the file decides.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));
const srcRoot = join(apiRoot, 'src');

function collect(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(path, out);
    } else if (entry.name.endsWith('.test.ts')) {
      out.push(path);
    }
  }
  return out;
}

const files = collect(srcRoot)
  .map((path) => relative(srcRoot, path).split(sep).join('/'))
  .filter((rel) => !rel.startsWith('integration/'))
  .filter((rel) => {
    const source = readFileSync(join(srcRoot, rel), 'utf8');
    return !/from\s+['"]vitest['"]/.test(source);
  })
  .sort();

if (files.length === 0) {
  console.error('[unit-tests] no node:test files found under src/');
  process.exit(1);
}

console.log(`[unit-tests] running ${files.length} node:test files`);
// A hung test must never stall the suite indefinitely — bound every test to
// a 3-minute ceiling so infra-dependent hangs surface as failures, not dead
// processes (overridable via UNIT_TEST_TIMEOUT_MS).
const testTimeoutMs = process.env.UNIT_TEST_TIMEOUT_MS ?? '180000';
const result = spawnSync(
  process.execPath,
  // --test-force-exit terminates lingering handles (e.g. reconnecting ioredis
  // clients imported transitively by test files) AFTER the run reports — a
  // manual process.exit() inside an after() hook instead truncates reporting
  // and exits 0 even when assertions fail.
  ['--import', 'tsx', '--test', '--test-force-exit', `--test-timeout=${testTimeoutMs}`, ...files.map((rel) => join(srcRoot, rel))],
  { stdio: 'inherit', cwd: apiRoot },
);
process.exit(result.status ?? 1);
