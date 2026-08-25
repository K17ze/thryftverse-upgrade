/**
 * PostgreSQL backup script.
 *
 * Creates a compressed, encrypted pg_dump of the production database.
 * Designed to be run by the GitHub Actions scheduled-db-backup workflow
 * or the Docker backup sidecar.
 *
 * Environment variables:
 *   DATABASE_URL            — PostgreSQL connection string (required)
 *   BACKUP_DIR              — Directory for backup files (default: ./backups)
 *   BACKUP_RETENTION_DAYS   — Delete backups older than N days (default: 30)
 *   BACKUP_ENCRYPTION_KEY   — If set, encrypts the dump with openssl AES-256-CBC
 *   ALERTING_WEBHOOK_URL    — Slack/Discord webhook for failure notifications
 *
 * Usage:
 *   node scripts/postgres-backup.mjs
 *
 * @module postgres-backup
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, unlinkSync, existsSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const DATABASE_URL = process.env.DATABASE_URL;
const BACKUP_DIR = process.env.BACKUP_DIR || join(process.cwd(), 'backups');
const BACKUP_RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);
const BACKUP_ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY;
const BACKUP_REQUIRE_ENCRYPTION = process.env.BACKUP_REQUIRE_ENCRYPTION;
const S3_BACKUP_BUCKET = process.env.S3_BACKUP_BUCKET;
const S3_BACKUP_PREFIX = process.env.S3_BACKUP_PREFIX || 'db-backups';
const ALERTING_WEBHOOK_URL = process.env.ALERTING_WEBHOOK_URL;

if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL environment variable is required.');
  process.exit(1);
}

if ((BACKUP_REQUIRE_ENCRYPTION === 'true' || process.env.NODE_ENV === 'production') && !BACKUP_ENCRYPTION_KEY) {
  console.error('FATAL: BACKUP_ENCRYPTION_KEY is required when BACKUP_REQUIRE_ENCRYPTION=true or NODE_ENV=production.');
  process.exit(1);
}

function sendAlert(message) {
  if (!ALERTING_WEBHOOK_URL) return;
  try {
    const payload = JSON.stringify({ content: message });
    execFileSync('curl', [
      '-s', '-X', 'POST',
      '-H', 'Content-Type: application/json',
      '-d', payload,
      ALERTING_WEBHOOK_URL,
    ], { stdio: 'pipe', timeout: 10000 });
  } catch {
    console.error('WARNING: Failed to send alerting webhook notification.');
  }
}

function uploadToS3(filePath) {
  if (!S3_BACKUP_BUCKET) return;
  const fileName = basename(filePath);
  const s3Key = `${S3_BACKUP_PREFIX}/${fileName}`;
  console.log(`Uploading to s3://${S3_BACKUP_BUCKET}/${s3Key}...`);
  execFileSync('aws', [
    's3', 'cp', filePath, `s3://${S3_BACKUP_BUCKET}/${s3Key}`,
    '--no-progress', '--sse', 'aws:kms',
  ], { stdio: 'inherit' });

  const checksum = execFileSync('sha256sum', [filePath], { encoding: 'utf8' }).split(' ')[0];
  const checksumPath = `${filePath}.sha256`;
  writeFileSync(checksumPath, `${checksum}\n`);
  const checksumS3Key = `${S3_BACKUP_PREFIX}/${basename(checksumPath)}`;
  execFileSync('aws', [
    's3', 'cp', checksumPath, `s3://${S3_BACKUP_BUCKET}/${checksumS3Key}`,
    '--no-progress', '--sse', 'aws:kms',
  ], { stdio: 'inherit' });
  unlinkSync(checksumPath);
}

function parseDatabaseUrl(url) {
  const match = url.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
  if (!match) {
    console.error('FATAL: DATABASE_URL is not a valid postgresql:// connection string.');
    process.exit(1);
  }
  return {
    user: decodeURIComponent(match[1]),
    password: decodeURIComponent(match[2]),
    host: match[3],
    port: match[4],
    database: match[5],
  };
}

function createBackup() {
  const db = parseDatabaseUrl(DATABASE_URL);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `thryftverse_${timestamp}`;
  const dumpPath = join(BACKUP_DIR, `${baseName}.dump`);
  const encryptedPath = join(BACKUP_DIR, `${baseName}.dump.enc`);

  mkdirSync(BACKUP_DIR, { recursive: true });

  console.log(`Starting pg_dump of database "${db.database}" from ${db.host}:${db.port}...`);

  const pgEnv = {
    ...process.env,
    PGPASSWORD: db.password,
  };

  try {
    execFileSync('pg_dump', [
      '--host', db.host,
      '--port', db.port,
      '--username', db.user,
      '--format', 'custom',
      '--compress', '9',
      '--no-owner',
      '--no-privileges',
      '--verbose',
      '--file', dumpPath,
      db.database,
    ], {
      env: pgEnv,
      stdio: ['pipe', 'inherit', 'inherit'],
      timeout: 600000,
    });

    const dumpStat = statSync(dumpPath);
    console.log(`pg_dump completed: ${dumpPath} (${(dumpStat.size / 1024 / 1024).toFixed(2)} MB)`);

    if (BACKUP_ENCRYPTION_KEY) {
      console.log('Encrypting backup with AES-256-CBC...');
      execFileSync('openssl', [
        'enc', '-aes-256-cbc',
        '-salt', '-pbkdf2',
        '-in', dumpPath,
        '-out', encryptedPath,
        '-pass', `env:BACKUP_ENCRYPTION_KEY`,
      ], {
        env: { ...process.env, BACKUP_ENCRYPTION_KEY },
        stdio: ['pipe', 'inherit', 'inherit'],
        timeout: 300000,
      });

      unlinkSync(dumpPath);
      console.log(`Encrypted backup: ${encryptedPath}`);
      return encryptedPath;
    }

    return dumpPath;
  } catch (error) {
    const msg = `FATAL: pg_dump failed for database "${db.database}": ${error.message}`;
    console.error(msg);
    sendAlert(`:x: **Database backup FAILED**\nDatabase: ${db.database}\nError: ${error.message}`);
    process.exit(1);
  }
}

function pruneOldBackups() {
  if (!existsSync(BACKUP_DIR)) return;

  const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const files = readdirSync(BACKUP_DIR).filter(
    (f) => f.startsWith('thryftverse_') && (f.endsWith('.dump') || f.endsWith('.dump.enc') || f.endsWith('.dump.sha256') || f.endsWith('.dump.enc.sha256'))
  );

  let deleted = 0;
  for (const file of files) {
    const filePath = join(BACKUP_DIR, file);
    const stat = statSync(filePath);
    if (stat.mtimeMs < cutoff) {
      unlinkSync(filePath);
      deleted++;
      console.log(`Pruned old backup: ${file}`);
    }
  }

  if (deleted > 0) {
    console.log(`Pruned ${deleted} backup(s) older than ${BACKUP_RETENTION_DAYS} days.`);
  }
}

const backupPath = createBackup();
uploadToS3(backupPath);
pruneOldBackups();
console.log(`Backup complete: ${backupPath}`);
