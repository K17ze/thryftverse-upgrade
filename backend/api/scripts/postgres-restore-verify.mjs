import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Client } from 'pg';

// pg resolves connection strings through pg-connection-string, whose query
// parameters can override URL authority (postgresql://u:p@decoy/db?host=prod
// connects to PROD). The guard must therefore compare the EFFECTIVE
// coordinates the driver will use — parse with the exact same parser.
const { parse: parsePgConnectionString } = createRequire(import.meta.url)(
  'pg-connection-string',
);

// Restore-verify drill — the counterpart to postgres-backup.mjs.
//
// Takes a produced backup artifact (.dump or .dump.enc), verifies its sha256
// sidecar when present, decrypts when needed, restores into a scratch
// database (NEVER the source/production URL), and then proves the restore
// by probing critical tables and emitting a JSON drill report with measured
// timings — the RTO/RPO evidence the production audit requires.
//
// Usage:
//   RESTORE_DATABASE_URL=postgresql://…/scratch_restore \
//   node scripts/postgres-restore-verify.mjs backups/thryftverse_2026-09-19.dump.enc
//
// Env:
//   BACKUP_ENCRYPTION_KEY   required when the artifact is .enc
//   RESTORE_DATABASE_URL    required — target scratch database (must differ
//                           from DATABASE_URL; the script refuses otherwise)
//   RESTORE_DROP_EXISTING   'true' to pass --clean --if-exists to pg_restore
//   RESTORE_VERIFY_TABLES   optional comma-separated table list overriding
//                           the default critical-table probe

// Table names must be the real stored names — the migrations create these
// unquoted (e.g. CREATE TABLE coOwn_assets), so Postgres folds them to
// lowercase. Quoting the camelCase form in COUNT(*) would probe a table
// that does not exist and fail the drill on a perfectly good restore.
const DEFAULT_VERIFY_TABLES = [
  'users',
  'listings',
  'orders',
  'order_events',
  'wallets',
  'wallet_ledger',
  'payment_intents',
  'payment_webhook_events',
  'listing_checkout_reservations',
  'coown_assets',
  'coown_holdings',
  'coown_orders',
  'coown_trades',
  'ledger_entries',
];

function run(cmd, args, { env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'inherit'],
      // No shell on any platform: pg_restore/openssl are real executables,
      // and a cmd.exe pass on Windows would re-interpret '&' and '%' inside
      // connection URLs (query params, credentials) as shell metacharacters.
      env: env ? { ...process.env, ...env } : process.env,
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${cmd} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function sha256Of(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function verifyChecksum(filePath) {
  const checksumPath = `${filePath}.sha256`;
  let expected;
  try {
    expected = (await readFile(checksumPath, 'utf8')).trim().split(/\s+/)[0];
  } catch {
    return { checked: false, reason: 'no .sha256 sidecar found' };
  }
  const actual = await sha256Of(filePath);
  if (actual !== expected) {
    throw new Error(
      `checksum mismatch for ${filePath}: expected ${expected}, got ${actual}`,
    );
  }
  return { checked: true, sha256: actual };
}

async function decryptBackup({ inputPath, outputPath, encryptionKey }) {
  await run('openssl', [
    'enc', '-d', '-aes-256-cbc',
    '-pbkdf2',
    '-in', inputPath,
    '-out', outputPath,
    '-pass', 'env:BACKUP_ENCRYPTION_KEY',
  ], { env: { BACKUP_ENCRYPTION_KEY: encryptionKey } });
}

async function restoreDump({ dumpPath, databaseUrl, dropExisting }) {
  const args = [
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--dbname', databaseUrl,
  ];
  if (dropExisting) {
    args.push('--clean', '--if-exists');
  }
  args.push(dumpPath);
  await run('pg_restore', args);
}

async function probeTables(databaseUrl, tables) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const results = [];
    for (const table of tables) {
      const reg = await client.query(
        `SELECT to_regclass($1)::text AS reg`, [`public.${table}`],
      );
      if (!reg.rows[0]?.reg) {
        results.push({ table, present: false });
        continue;
      }
      // Count via the resolved regclass text — Postgres returns the stored
      // (case-folded, already-quoted-if-needed) relation reference, so the
      // probe cannot drift from what actually exists in the restore.
      const relname = reg.rows[0].reg;
      const count = await client.query(
        `SELECT COUNT(*)::text AS n FROM ${relname}`,
      );
      results.push({ table, present: true, rows: Number(count.rows[0].n) });
    }
    return results;
  } finally {
    await client.end();
  }
}

// Connection-string query parameters that pg-connection-string lets override
// the URL authority (postgresql://u:p@decoy/db?host=prod connects to prod).
// A scratch restore target must identify itself in the URL authority/path —
// connection-param overrides on the TARGET are rejected outright rather than
// silently resolved, so the URL an operator writes is the URL that connects.
const CONNECTION_OVERRIDE_PARAMS = new Set([
  'host',
  'port',
  'dbname',
  'database',
  'user',
  'password',
]);

// Parse a connection string into the normalized EFFECTIVE coordinates the pg
// driver will actually use — the same pg-connection-string semantics as
// Client({ connectionString }) and pg_restore's libpq handling. Comparing raw
// strings, URL authority only, or substring-matching is unsafe: query params
// can override host/port/database, credentials or a hostname containing
// "test" can spoof the marker check, and trivially different spellings
// (default port, percent-encoding) can hide an identical target.
function parseDatabaseUrl(raw, label) {
  // Scheme check stays URL-based: keyword DSNs are valid pg connection
  // strings too, but for the drill target we require an explicit URL so the
  // operator's intent is unambiguous.
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} is not a valid connection URL`);
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`${label} must be a postgres:// connection URL`);
  }

  const overrideParams = [...url.searchParams.keys()].filter((key) =>
    CONNECTION_OVERRIDE_PARAMS.has(key.toLowerCase()),
  );
  if (overrideParams.length > 0) {
    throw new Error(
      `${label} carries connection-override query parameter(s) [${overrideParams.join(', ')}] ` +
        'that can redirect the connection away from the URL authority — refusing to continue. ' +
        'Put host, port, database and credentials in the URL itself.',
    );
  }

  // Now resolve the effective coordinates with the same parser the pg
  // driver uses. With override params rejected above this can no longer be
  // redirected, but parsing through pg-connection-string additionally
  // normalizes percent-encoding, IPv6 brackets and default port handling so
  // the source/target comparison is over real connection semantics.
  let effective;
  try {
    effective = parsePgConnectionString(raw);
  } catch {
    throw new Error(`${label} could not be parsed with pg connection-string semantics`);
  }

  // libpq/node-pg fall back to PG* environment variables (and inherited
  // process.env is passed to pg_restore below). A URL with an empty host
  // (postgresql:///db) therefore does NOT mean "no host" — it means "whatever
  // PGHOST says". Resolve every empty coordinate through the same env
  // fallback so the guard compares where the connection will actually go,
  // never the literal string the operator wrote.
  const rawHost = effective.host ?? url.hostname ?? '';
  const rawPort = String(effective.port ?? '');
  // A comma-separated host or port is a libpq multi-host list — each entry is
  // tried in turn, so "scratch,prod" still connects to prod. A drill target
  // must be one explicit endpoint; refuse lists outright.
  if (rawHost.includes(',') || rawPort.includes(',')) {
    throw new Error(
      `${label} carries a multi-host/multi-port list — refusing to continue. ` +
        'Point the drill at a single explicit scratch endpoint.',
    );
  }
  const envHost = (process.env.PGHOST ?? '').split(',')[0].trim();
  const envPort = (process.env.PGPORT ?? '').split(',')[0].trim();
  return {
    // Empty host: libpq consults PGHOST, then the default unix socket dir /
    // localhost. 'localhost' is the safe canonical form — a PGHOST of
    // 'prod.db' resolves here and fails the same-target check correctly.
    host: (rawHost || envHost || 'localhost').toLowerCase(),
    port: rawPort || envPort || '5432',
    db: effective.database ?? process.env.PGDATABASE ?? '',
    user: effective.user ?? process.env.PGUSER ?? '',
  };
}

// Extract coordinates from a libpq keyword DSN ("host=prod dbname=app
// user=u"). The installed pg-connection-string only understands URLs, so the
// source side needs this small extractor to compare a keyword-DSN
// DATABASE_URL against a URL-form restore target.
function parseKeywordDsn(raw) {
  if (!/^\s*[A-Za-z_]+\s*=/.test(raw)) {
    return null;
  }
  const fields = {};
  for (const match of raw.matchAll(/([A-Za-z_]+)\s*=\s*('[^']*'|\S+)/g)) {
    fields[match[1].toLowerCase()] = match[2].replace(/^'|'$/g, '');
  }
  if (!fields.host && !fields.dbname) {
    return null;
  }
  return {
    host: (fields.host ?? '').toLowerCase(),
    port: fields.port || '5432',
    db: fields.dbname ?? fields.database ?? '',
  };
}

function assertScratchTarget(databaseUrl) {
  if (!databaseUrl) {
    throw new Error('RESTORE_DATABASE_URL is required — restores only run against a scratch database');
  }
  const target = parseDatabaseUrl(databaseUrl, 'RESTORE_DATABASE_URL');
  if (!target.db) {
    throw new Error('RESTORE_DATABASE_URL has no database name — refusing to continue');
  }
  const sourceRaw = process.env.DATABASE_URL;
  if (sourceRaw) {
    // DATABASE_URL may be a libpq keyword DSN rather than a URL — handle both
    // forms, and keep exact-string equality as a final fallback.
    let sameTarget = sourceRaw === databaseUrl;
    try {
      const envHost = (process.env.PGHOST ?? '').split(',')[0].trim().toLowerCase();
      const envPort = (process.env.PGPORT ?? '').split(',')[0].trim();
      const keywordSource = parseKeywordDsn(sourceRaw);
      const source = keywordSource ?? (() => {
        const parsed = parsePgConnectionString(sourceRaw);
        return {
          host: (parsed.host ?? '').toLowerCase(),
          port: String(parsed.port ?? ''),
          db: parsed.database ?? parsed.dbname ?? '',
        };
      })();
      // Apply the same env fallbacks as the target side: a source whose
      // coordinates come from PGHOST/PGPORT/PGDATABASE must still compare
      // equal when the target spells them out explicitly (and vice versa).
      // A multi-host source (host=a,b) means libpq may reach ANY entry —
      // the target must not match any of them, not just the first.
      const sourceHosts = (source.host || envHost || 'localhost')
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean);
      const sourcePorts = (source.port || envPort || '5432').split(',').map((p) => p.trim());
      source.db = source.db || process.env.PGDATABASE || '';
      sameTarget =
        sameTarget ||
        sourceHosts.some(
          (h, i) =>
            h === target.host &&
            (sourcePorts[i] ?? sourcePorts[0] ?? '5432') === target.port &&
            source.db === target.db,
        );
    } catch {
      // unparseable source — the string comparison above is the best we can do
    }
    if (sameTarget) {
      throw new Error(
        'RESTORE_DATABASE_URL resolves to the same host:port/database as DATABASE_URL — refusing to restore over the source database',
      );
    }
  }
  // The marker must be on the EFFECTIVE DATABASE NAME itself — matching the
  // full URL would let a prod URL pass when 'test'/'staging' appears in
  // credentials, a query param, or the hostname.
  const scratchMarkers = /(scratch|restore|drill|staging|test)/i;
  if (!scratchMarkers.test(target.db)) {
    throw new Error(
      `RESTORE_DATABASE_URL database name "${target.db}" does not look like a scratch/drill database ` +
        '(expected a name containing scratch, restore, drill, staging or test) — refusing to continue',
    );
  }
}

async function main() {
  const artifactPath = process.argv[2];
  if (!artifactPath) {
    throw new Error('usage: postgres-restore-verify.mjs <backup.dump[.enc]>');
  }
  const resolvedArtifact = path.resolve(artifactPath);
  const info = await stat(resolvedArtifact).catch(() => null);
  if (!info?.isFile()) {
    throw new Error(`backup artifact not found: ${resolvedArtifact}`);
  }

  const restoreUrl = process.env.RESTORE_DATABASE_URL;
  assertScratchTarget(restoreUrl);

  const startedAt = Date.now();
  const report = {
    ok: false,
    artifact: resolvedArtifact,
    artifactBytes: info.size,
    targetDatabase: restoreUrl.replace(/\/\/[^@]+@/, '//***@'),
    phases: {},
    generatedAt: new Date().toISOString(),
  };

  const workDir = await mkdtemp(path.join(tmpdir(), 'thryftverse-restore-'));
  try {
    // 1. Checksum verification (artifact itself, before decryption).
    let t = Date.now();
    report.phases.checksum = await verifyChecksum(resolvedArtifact);
    report.phases.checksum.ms = Date.now() - t;

    // 2. Decrypt if needed.
    let dumpPath = resolvedArtifact;
    if (resolvedArtifact.endsWith('.enc')) {
      const key = process.env.BACKUP_ENCRYPTION_KEY;
      if (!key) {
        throw new Error('BACKUP_ENCRYPTION_KEY is required to restore an encrypted artifact');
      }
      t = Date.now();
      dumpPath = path.join(workDir, 'restore.dump');
      await decryptBackup({ inputPath: resolvedArtifact, outputPath: dumpPath, encryptionKey: key });
      report.phases.decrypt = { ms: Date.now() - t };
    }

    // 3. Restore into the scratch database.
    t = Date.now();
    const dropExisting = process.env.RESTORE_DROP_EXISTING === 'true';
    await restoreDump({ dumpPath, databaseUrl: restoreUrl, dropExisting });
    report.phases.restore = { ms: Date.now() - t, clean: dropExisting };

    // 4. Probe critical tables — the drill fails if any are absent.
    t = Date.now();
    const verifyTables = process.env.RESTORE_VERIFY_TABLES
      ? process.env.RESTORE_VERIFY_TABLES.split(',').map((s) => s.trim()).filter(Boolean)
      : DEFAULT_VERIFY_TABLES;
    const probes = await probeTables(restoreUrl, verifyTables);
    report.phases.verify = { ms: Date.now() - t, tables: probes };
    const missing = probes.filter((p) => !p.present).map((p) => p.table);
    if (missing.length > 0) {
      throw new Error(`restore incomplete — missing tables: ${missing.join(', ')}`);
    }

    report.ok = true;
    report.rtoMs = Date.now() - startedAt;
    report.rtoSeconds = Number((report.rtoMs / 1000).toFixed(1));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[restore:verify] failed', error);
  process.exit(1);
});
