import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseRetentionDays(raw, fallback) {
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function timestampForFile(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function runPgDump({ databaseUrl, outputPath }) {
  const args = [
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--file',
    outputPath,
    databaseUrl,
  ];

  await new Promise((resolve, reject) => {
    const child = spawn('pg_dump', args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`pg_dump exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function encryptBackup({ inputPath, outputPath, encryptionKey }) {
  const args = [
    'enc', '-aes-256-cbc',
    '-salt', '-pbkdf2',
    '-in', inputPath,
    '-out', outputPath,
    '-pass', 'env:BACKUP_ENCRYPTION_KEY',
  ];

  await new Promise((resolve, reject) => {
    const child = spawn('openssl', args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, BACKUP_ENCRYPTION_KEY: encryptionKey },
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`openssl enc exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function uploadToS3({ filePath, bucket, prefix }) {
  const fileName = path.basename(filePath);
  const key = `${prefix}/${fileName}`;

  await new Promise((resolve, reject) => {
    const child = spawn('aws', [
      's3', 'cp', filePath, `s3://${bucket}/${key}`,
      '--no-progress', '--sse', 'aws:kms',
    ], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`aws s3 cp exited with code ${code ?? 'unknown'}`));
    });
  });

  const fileBuffer = await readFile(filePath);
  const checksum = createHash('sha256').update(fileBuffer).digest('hex');
  const checksumPath = `${filePath}.sha256`;
  await writeFile(checksumPath, `${checksum}\n`);

  const checksumKey = `${prefix}/${path.basename(checksumPath)}`;
  await new Promise((resolve, reject) => {
    const child = spawn('aws', [
      's3', 'cp', checksumPath, `s3://${bucket}/${checksumKey}`,
      '--no-progress', '--sse', 'aws:kms',
    ], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`aws s3 cp exited with code ${code ?? 'unknown'}`));
    });
  });

  await rm(checksumPath, { force: true });
}

async function cleanupOldBackups({ backupDir, retentionDays }) {
  const entries = await readdir(backupDir);
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  let removed = 0;

  for (const entry of entries) {
    if (!entry.startsWith('thryftverse_') || !entry.endsWith('.dump')) {
      continue;
    }

    const fullPath = path.join(backupDir, entry);
    const details = await stat(fullPath);

    if (details.mtimeMs < cutoffMs) {
      await rm(fullPath, { force: true });
      removed += 1;
    }
  }

  const encEntries = await readdir(backupDir);
  for (const entry of encEntries) {
    if (!entry.startsWith('thryftverse_') || !(entry.endsWith('.dump.enc') || entry.endsWith('.dump.sha256') || entry.endsWith('.dump.enc.sha256'))) {
      continue;
    }

    const fullPath = path.join(backupDir, entry);
    const details = await stat(fullPath);

    if (details.mtimeMs < cutoffMs) {
      await rm(fullPath, { force: true });
      removed += 1;
    }
  }

  return removed;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run backup:db');
  }

  const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;
  const requireEncryption = process.env.BACKUP_REQUIRE_ENCRYPTION === 'true' || process.env.NODE_ENV === 'production';

  if (requireEncryption && !encryptionKey) {
    throw new Error('BACKUP_ENCRYPTION_KEY is required when BACKUP_REQUIRE_ENCRYPTION=true or NODE_ENV=production');
  }

  const backupDir = process.env.BACKUP_DIR
    ? path.resolve(process.env.BACKUP_DIR)
    : path.resolve(process.cwd(), 'backups');

  const retentionDays = parseRetentionDays(process.env.BACKUP_RETENTION_DAYS, 14);

  await mkdir(backupDir, { recursive: true });

  const fileName = `thryftverse_${timestampForFile(new Date())}.dump`;
  const outputPath = path.join(backupDir, fileName);

  await runPgDump({ databaseUrl, outputPath });

  let backupFile = outputPath;

  if (encryptionKey) {
    const encryptedPath = `${outputPath}.enc`;
    await encryptBackup({ inputPath: outputPath, outputPath: encryptedPath, encryptionKey });
    await rm(outputPath, { force: true });
    backupFile = encryptedPath;
  }

  const s3Bucket = process.env.S3_BACKUP_BUCKET;
  if (s3Bucket) {
    const s3Prefix = process.env.S3_BACKUP_PREFIX || 'db-backups';
    await uploadToS3({ filePath: backupFile, bucket: s3Bucket, prefix: s3Prefix });
  }

  const removed = await cleanupOldBackups({ backupDir, retentionDays });

  const result = {
    ok: true,
    backupFile,
    retentionDays,
    removedOldBackups: removed,
    generatedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('[backup:db] failed', error);
  process.exit(1);
});
