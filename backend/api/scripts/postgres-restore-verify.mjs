import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from 'pg';

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
  'coOwn_assets',
  'coOwn_holdings',
  'coOwn_orders',
  'coOwn_trades',
  'ledger_entries',
];

function run(cmd, args, { env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'inherit'],
      shell: process.platform === 'win32',
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
      const count = await client.query(
        `SELECT COUNT(*)::text AS n FROM "${table.replace(/"/g, '')}"`,
      );
      results.push({ table, present: true, rows: Number(count.rows[0].n) });
    }
    return results;
  } finally {
    await client.end();
  }
}

function assertScratchTarget(databaseUrl) {
  const source = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('RESTORE_DATABASE_URL is required — restores only run against a scratch database');
  }
  if (source && source === databaseUrl) {
    throw new Error(
      'RESTORE_DATABASE_URL equals DATABASE_URL — refusing to restore over the source database',
    );
  }
  const scratchMarkers = /(scratch|restore|drill|staging|test)/i;
  if (!scratchMarkers.test(databaseUrl)) {
    throw new Error(
      'RESTORE_DATABASE_URL does not look like a scratch/drill database (expected a name containing scratch, restore, drill, staging or test) — refusing to continue',
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
