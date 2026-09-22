import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// Audit 4.10 / Appendix D blocker 3: the restore target guard must compare
// the EFFECTIVE connection coordinates — pg resolves connection strings via
// pg-connection-string, where query params like ?host= override the URL
// authority. The guard functions are extracted from the script source into
// a node:vm sandbox (the same read-only technique the audit used) so the
// real guard code is exercised without executing a restore.
const SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../scripts/postgres-restore-verify.mjs',
);

function loadGuard(): {
  assertScratchTarget: (url: string | undefined) => void;
  env: Record<string, string | undefined>;
} {
  const source = readFileSync(SCRIPT_PATH, 'utf8');
  const reqStart = source.indexOf('const { parse: parsePgConnectionString }');
  const reqEnd = source.indexOf(';', reqStart) + 1;
  const requireLine = source
    .slice(reqStart, reqEnd)
    .replaceAll('import.meta.url', JSON.stringify(SCRIPT_PATH));
  const start = source.indexOf('const CONNECTION_OVERRIDE_PARAMS');
  const end = source.indexOf('async function main()');
  assert.ok(reqStart > 0 && start > reqStart && end > start, 'guard source layout changed — update extractor');
  const snippet = `${requireLine}\n${source.slice(start, end)}`;

  const env: Record<string, string | undefined> = {};
  const sandbox: Record<string, unknown> = {
    process: { env },
    console,
    URL,
    createRequire,
  };
  vm.createContext(sandbox);
  vm.runInContext(`${snippet}\nthis.__guard = { assertScratchTarget };`, sandbox);
  return {
    assertScratchTarget: (sandbox as { __guard: { assertScratchTarget: (u: string | undefined) => void } })
      .__guard.assertScratchTarget,
    env,
  };
}

const guard = loadGuard();

function withSource(sourceUrl: string | undefined, target: string | undefined): void {
  // The guard reads process.env.DATABASE_URL inside the vm — set the
  // sandbox's env, not the host process's.
  if (sourceUrl === undefined) {
    delete guard.env.DATABASE_URL;
  } else {
    guard.env.DATABASE_URL = sourceUrl;
  }
  try {
    guard.assertScratchTarget(target);
  } finally {
    delete guard.env.DATABASE_URL;
  }
}

function accepted(source: string | undefined, target: string | undefined): boolean {
  try {
    withSource(source, target);
    return true;
  } catch {
    return false;
  }
}

test('decoy authority with ?host=prod query override is rejected (audit reproduction)', () => {
  // pg-connection-string resolves this target's effective host to `prod` —
  // the old authority-only guard accepted it and would have restored onto
  // the source database.
  assert.equal(
    accepted('postgresql://u:p@prod/app_test', 'postgresql://u:p@decoy/app_test?host=prod'),
    false,
  );
});

test('connection-override query params on the target are all rejected', () => {
  const source = 'postgresql://u:p@prod/app';
  for (const param of ['host=x', 'port=5433', 'dbname=prod', 'user=postgres', 'password=x']) {
    assert.equal(
      accepted(source, `postgresql://u:p@scratch/app_test?${param}`),
      false,
      `expected ?${param} override to be rejected`,
    );
  }
});

test('credential-only scratch marker on the source db name is rejected', () => {
  assert.equal(accepted('postgresql://u:p@prod/app', 'postgresql://u:test@prod/app'), false);
});

test('same effective host:port/database with explicit default port is rejected', () => {
  assert.equal(
    accepted('postgresql://u:p@prod/app_test', 'postgresql://u:p@prod:5432/app_test'),
    false,
  );
});

test('keyword-DSN source pointing at the same database is rejected', () => {
  assert.equal(
    accepted('host=prod dbname=app_test user=u', 'postgresql://u:p@prod/app_test'),
    false,
  );
});

test('identical connection strings are rejected', () => {
  const url = 'postgresql://u:p@prod/app_test';
  assert.equal(accepted(url, url), false);
});

test('a real scratch target on a different host is accepted', () => {
  assert.equal(
    accepted('postgresql://u:p@prod/app', 'postgresql://u:p@localhost/app_scratch'),
    true,
  );
});

test('non-connection query params (sslmode) do not break a valid scratch target', () => {
  assert.equal(
    accepted('postgresql://u:p@prod/app', 'postgresql://u:p@localhost/app_restore?sslmode=disable'),
    true,
  );
});

test('missing marker in the effective database name is rejected', () => {
  assert.equal(accepted('postgresql://u:p@prod/app', 'postgresql://u:p@localhost/app'), false);
});

test('missing RESTORE_DATABASE_URL is rejected', () => {
  assert.equal(accepted('postgresql://u:p@prod/app', undefined), false);
});

// F1: an empty-host URL resolves via PGHOST at connect time — the guard must
// compare the env-resolved coordinate, not the literal empty host.
test('empty-host target resolves PGHOST — same-target is rejected', () => {
  guard.env.PGHOST = 'prod';
  try {
    assert.equal(
      accepted('postgresql://u:p@prod/app_test', 'postgresql:///app_test'),
      false,
    );
  } finally {
    delete guard.env.PGHOST;
  }
});

test('empty-host target on a different cluster is accepted', () => {
  guard.env.PGHOST = 'scratch-host';
  try {
    assert.equal(
      accepted('postgresql://u:p@prod/app', 'postgresql:///app_scratch'),
      true,
    );
  } finally {
    delete guard.env.PGHOST;
  }
});

// F2: a comma-separated host list is a libpq multi-host DSN — every entry is
// tried, so the target must be a single explicit endpoint.
test('multi-host target conninfo is rejected', () => {
  assert.equal(
    accepted(
      'postgresql://u:p@prod/app',
      'postgresql://u:p@scratch1,prod/app_restore',
    ),
    false,
  );
});

test('multi-host source still matches a prod target entry', () => {
  assert.equal(
    accepted('host=scratch,prod dbname=app_restore user=u', 'postgresql://u:p@prod/app_restore'),
    false,
  );
});
