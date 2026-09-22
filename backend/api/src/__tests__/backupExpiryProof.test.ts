import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { processBackupExpiryCheck } from '../workers/handlers/backupExpiryHandler.js';

// Audit 4.8 / Appendix D blocker 2 regression: purge proof must use the
// snapshot-boundary (content) time embedded in the artifact key — not the
// object LastModified upload time — must inventory noncurrent versions, and
// must fail closed on any unknown rather than asserting purge on a partial
// picture. The S3 transport is stubbed at S3Client.prototype.send so the
// real inventory/decision code runs; the manifest pool is faked.

process.env.NODE_ENV ??= 'test';
process.env.S3_BACKUP_BUCKET = 'backup-test-bucket';
process.env.S3_BACKUP_PREFIX = 'db-backups';

const ERASED_AT = new Date('2026-09-20T12:00:00Z');

interface FakeManifestRow {
  id: string;
  user_id: string;
  erasure_regime: string;
  erased_at: Date;
  purge_deadline: Date;
}

function manifestRow(id: string): FakeManifestRow {
  return {
    id,
    user_id: `user_${id}`,
    erasure_regime: 'gdpr',
    erased_at: ERASED_AT,
    purge_deadline: new Date('2026-09-21T00:00:00Z'),
  };
}

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

function fakePool(rows: FakeManifestRow[]) {
  const queries: RecordedQuery[] = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params: params ?? [] });
      if (sql.includes('FROM backup_deletion_manifest')) {
        return { rows };
      }
      return { rows: [] };
    },
  };
  return { pool, queries };
}

function purgedIds(queries: RecordedQuery[]): string[] {
  const update = queries.find(
    (q) => q.sql.includes('purged_at = NOW()') && q.sql.includes('store_inventory_verified'),
  );
  return update ? (update.params[0] as string[]) : [];
}

function failedIds(queries: RecordedQuery[]): string[] {
  const updates = queries.filter(
    (q) => q.sql.includes("'purge_failed'") && q.sql.includes('WHERE id = ANY'),
  );
  return updates.flatMap((q) => q.params[0] as string[]);
}

function stubS3(
  t: test.TestContext,
  handler: (command: unknown) => unknown,
  options: {
    /** Override the default HeadObject response (well-formed provenance). */
    head?: (command: HeadObjectCommand) => unknown;
    /** Override the default empty multipart listing. */
    multipart?: (command: ListMultipartUploadsCommand) => unknown;
  } = {},
): void {
  const originalSend = S3Client.prototype.send;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (S3Client.prototype as any).send = async function (command: unknown) {
    // Defaults for the provenance/multipart inventory commands — handlers in
    // individual tests only model the listings they exercise.
    if (command instanceof ListMultipartUploadsCommand) {
      return options.multipart
        ? options.multipart(command)
        : { Uploads: [], IsTruncated: false };
    }
    if (command instanceof HeadObjectCommand) {
      if (options.head) return options.head(command);
      // Well-formed artifact: provenance metadata echoes the key timestamp.
      const key = (command.input as { Key?: string }).Key ?? '';
      const m = /thryftverse_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)/.exec(key);
      return { Metadata: m ? { 'snapshot-started-at': m[1] } : {} };
    }
    return handler(command);
  };
  t.after(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (S3Client.prototype as any).send = originalSend;
  });
}

function listPage(contents: Array<{ Key: string; LastModified?: Date }>) {
  return { Contents: contents, IsTruncated: false };
}

test('snapshot started before erasure but uploaded after fails purge — LastModified alone is not proof', async (t) => {
  stubS3(t, (command) => {
    if (command instanceof ListObjectsV2Command) {
      // Key embeds snapshot START (11:00, before the 12:00 erasure) while
      // LastModified is the post-erasure upload time — the old predicate
      // would have confirmed purge here.
      return listPage([
        {
          Key: 'db-backups/thryftverse_2026-09-20T11-00-00Z.dump.enc',
          LastModified: new Date('2026-09-21T03:00:00Z'),
        },
      ]);
    }
    if (command instanceof ListObjectVersionsCommand) {
      return { Versions: [], DeleteMarkers: [], IsTruncated: false };
    }
    throw new Error('unexpected command');
  });

  const { pool, queries } = fakePool([manifestRow('m1')]);
  await processBackupExpiryCheck({ reason: 'scheduled' }, pool as never);

  assert.deepEqual(purgedIds(queries), []);
  assert.deepEqual(failedIds(queries), ['m1']);
});

test('post-erasure snapshot only → purge is confirmed', async (t) => {
  stubS3(t, (command) => {
    if (command instanceof ListObjectsV2Command) {
      return listPage([
        {
          Key: 'db-backups/thryftverse_2026-09-21T02-00-00Z.dump.enc',
          LastModified: new Date('2026-09-21T02:10:00Z'),
        },
      ]);
    }
    if (command instanceof ListObjectVersionsCommand) {
      return { Versions: [], DeleteMarkers: [], IsTruncated: false };
    }
    throw new Error('unexpected command');
  });

  const { pool, queries } = fakePool([manifestRow('m1')]);
  await processBackupExpiryCheck({ reason: 'scheduled' }, pool as never);

  assert.deepEqual(purgedIds(queries), ['m1']);
  assert.deepEqual(failedIds(queries), []);
});

test('object with no parseable snapshot boundary fails closed — unknown is not purged', async (t) => {
  stubS3(t, (command) => {
    if (command instanceof ListObjectsV2Command) {
      return listPage([
        {
          Key: 'db-backups/manual-copy.dump',
          LastModified: new Date('2026-09-21T03:00:00Z'),
        },
      ]);
    }
    if (command instanceof ListObjectVersionsCommand) {
      return { Versions: [], DeleteMarkers: [], IsTruncated: false };
    }
    throw new Error('unexpected command');
  });

  const { pool, queries } = fakePool([manifestRow('m1')]);
  await processBackupExpiryCheck({ reason: 'scheduled' }, pool as never);

  assert.deepEqual(purgedIds(queries), []);
  assert.deepEqual(failedIds(queries), ['m1']);
});

test('retained noncurrent version of a pre-erasure snapshot fails purge even when current listing is clean', async (t) => {
  stubS3(t, (command) => {
    if (command instanceof ListObjectsV2Command) {
      // Current listing has only a post-erasure object.
      return listPage([
        {
          Key: 'db-backups/thryftverse_2026-09-21T02-00-00Z.dump.enc',
          LastModified: new Date('2026-09-21T02:10:00Z'),
        },
      ]);
    }
    if (command instanceof ListObjectVersionsCommand) {
      return {
        IsTruncated: false,
        Versions: [
          // A "deleted" pre-erasure dump retained as a noncurrent version.
          {
            Key: 'db-backups/thryftverse_2026-09-19T02-00-00Z.dump.enc',
            LastModified: new Date('2026-09-19T02:05:00Z'),
            IsLatest: false,
            VersionId: 'v_old',
          },
        ],
        DeleteMarkers: [
          {
            Key: 'db-backups/thryftverse_2026-09-19T02-00-00Z.dump.enc',
            LastModified: new Date('2026-09-20T18:00:00Z'),
            IsLatest: true,
          },
        ],
      };
    }
    throw new Error('unexpected command');
  });

  const { pool, queries } = fakePool([manifestRow('m1')]);
  await processBackupExpiryCheck({ reason: 'scheduled' }, pool as never);

  assert.deepEqual(purgedIds(queries), []);
  assert.deepEqual(failedIds(queries), ['m1']);
});

test('denied version listing fails closed instead of asserting purge', async (t) => {
  stubS3(t, (command) => {
    if (command instanceof ListObjectsV2Command) {
      return listPage([]);
    }
    if (command instanceof ListObjectVersionsCommand) {
      const err = new Error('Access Denied');
      err.name = 'AccessDenied';
      throw err;
    }
    throw new Error('unexpected command');
  });

  const { pool, queries } = fakePool([manifestRow('m1')]);
  await processBackupExpiryCheck({ reason: 'scheduled' }, pool as never);

  // Version inventory denied → the whole batch is marked purge_failed via
  // the blanket update (no per-row id list) and nothing is confirmed purged.
  assert.deepEqual(purgedIds(queries), []);
  assert.ok(
    queries.some(
      (q) =>
        q.sql.includes('purge_failed') &&
        q.sql.includes('purge_deadline < NOW()'),
    ),
    'expected a blanket purge_failed update when version inventory is unavailable',
  );
});

test('store without versioning support (NotImplemented) relies on the current listing', async (t) => {
  stubS3(t, (command) => {
    if (command instanceof ListObjectsV2Command) {
      return listPage([
        {
          Key: 'db-backups/thryftverse_2026-09-21T02-00-00Z.dump.enc',
          LastModified: new Date('2026-09-21T02:10:00Z'),
        },
      ]);
    }
    if (command instanceof ListObjectVersionsCommand) {
      const err = new Error('not implemented');
      err.name = 'NotImplemented';
      throw err;
    }
    throw new Error('unexpected command');
  });

  const { pool, queries } = fakePool([manifestRow('m1')]);
  await processBackupExpiryCheck({ reason: 'scheduled' }, pool as never);

  assert.deepEqual(purgedIds(queries), ['m1']);
});

test('no overdue entries → no inventory or writes at all', async (t) => {
  let s3Called = false;
  stubS3(t, () => {
    s3Called = true;
    return listPage([]);
  });

  const { pool, queries } = fakePool([]);
  await processBackupExpiryCheck({ reason: 'scheduled' }, pool as never);

  assert.equal(s3Called, false);
  assert.equal(queries.filter((q) => q.sql.includes('UPDATE')).length, 0);
});

test('renamed forged artifact — metadata disagrees with key → fails closed', async (t) => {
  stubS3(
    t,
    (command) => {
      if (command instanceof ListObjectsV2Command) {
        // A pre-erasure dump copied under a post-erasure key — the key lies.
        return listPage([
          {
            Key: 'db-backups/thryftverse_2026-09-21T02-00-00Z.dump.enc',
            LastModified: new Date('2026-09-21T02:10:00Z'),
          },
        ]);
      }
      if (command instanceof ListObjectVersionsCommand) {
        return { Versions: [], DeleteMarkers: [], IsTruncated: false };
      }
      throw new Error('unexpected command');
    },
    {
      // s3 cp preserves user metadata — the copy still carries the true
      // pre-erasure snapshot-start stamp.
      head: () => ({ Metadata: { 'snapshot-started-at': '2026-09-20T11-00-00Z' } }),
    },
  );

  const { pool, queries } = fakePool([manifestRow('m1')]);
  await processBackupExpiryCheck({ reason: 'scheduled' }, pool as never);

  assert.deepEqual(purgedIds(queries), []);
  assert.deepEqual(failedIds(queries), ['m1']);
});

test('content artifact missing provenance metadata fails closed', async (t) => {
  stubS3(
    t,
    (command) => {
      if (command instanceof ListObjectsV2Command) {
        return listPage([
          {
            Key: 'db-backups/thryftverse_2026-09-21T02-00-00Z.dump.enc',
            LastModified: new Date('2026-09-21T02:10:00Z'),
          },
        ]);
      }
      if (command instanceof ListObjectVersionsCommand) {
        return { Versions: [], DeleteMarkers: [], IsTruncated: false };
      }
      throw new Error('unexpected command');
    },
    { head: () => ({ Metadata: {} }) },
  );

  const { pool, queries } = fakePool([manifestRow('m1')]);
  await processBackupExpiryCheck({ reason: 'scheduled' }, pool as never);

  assert.deepEqual(purgedIds(queries), []);
  assert.deepEqual(failedIds(queries), ['m1']);
});

test('in-progress multipart upload under the prefix fails closed', async (t) => {
  stubS3(
    t,
    (command) => {
      if (command instanceof ListObjectsV2Command) {
        return listPage([
          {
            Key: 'db-backups/thryftverse_2026-09-21T02-00-00Z.dump.enc',
            LastModified: new Date('2026-09-21T02:10:00Z'),
          },
        ]);
      }
      if (command instanceof ListObjectVersionsCommand) {
        return { Versions: [], DeleteMarkers: [], IsTruncated: false };
      }
      throw new Error('unexpected command');
    },
    {
      multipart: () => ({
        Uploads: [{ Key: 'db-backups/thryftverse_2026-09-21T03-00-00Z.dump.enc' }],
        IsTruncated: false,
      }),
    },
  );

  const { pool, queries } = fakePool([manifestRow('m1')]);
  await processBackupExpiryCheck({ reason: 'scheduled' }, pool as never);

  assert.deepEqual(purgedIds(queries), []);
  // Blanket early-exit — same assertion shape as the version-inventory guard.
  assert.ok(
    queries.some(
      (q) =>
        q.sql.includes('purge_failed') &&
        q.sql.includes('purge_deadline < NOW()') &&
        !q.sql.includes('id = ANY'),
    ),
    'expected a blanket purge_failed update when in-progress uploads exist',
  );
});
