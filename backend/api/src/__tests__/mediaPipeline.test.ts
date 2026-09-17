/**
 * Media pipeline P0 regression coverage.
 *
 * 1. claimProcessingJob must atomically advance media_assets.status to
 *    'processing' — the results endpoint's lifecycle state machine rejects
 *    publishable/moderation_pending/processing_failed from
 *    integrity_verified, so a claim that only touches the job row wedges
 *    every healthy asset.
 * 2. uploadHlsOutput must write objects under stream_${i}/ — the ffmpeg
 *    master playlist references "stream_${i}/playlist.m3u8" relative to its
 *    own URL, and fMP4 init.mp4 segments must be uploaded (EXT-X-MAP).
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';

const putCalls: Array<{ key: string; contentType: string }> = [];
const abortCalls: Array<{ key: string; uploadId: string; bucket?: string }> = [];
const deleteCalls: Array<{ key: string; bucket?: string }> = [];
let abortError: Error | null = null;
let orphanUploads: Array<{ key: string; uploadId: string; initiated?: Date }> = [];
let existingObjects = new Set<string>();

vi.mock('../lib/s3.js', () => ({
  getObject: vi.fn(async () => Buffer.alloc(0)),
  putBinaryObject: vi.fn(async (key: string, _buf: Buffer, contentType: string) => {
    putCalls.push({ key, contentType });
    return `https://cdn.example.com/media/${key}`;
  }),
  putJsonObject: vi.fn(async () => 'https://cdn.example.com/media/x.json'),
  abortMultipartUpload: vi.fn(async (key: string, uploadId: string, bucket?: string) => {
    if (abortError) throw abortError;
    abortCalls.push({ key, uploadId, bucket });
  }),
  listMultipartUploads: vi.fn(async () => orphanUploads),
  objectExists: vi.fn(async (key: string) => existingObjects.has(key)),
  deleteObject: vi.fn(async (key: string, bucket?: string) => {
    deleteCalls.push({ key, bucket });
  }),
}));

vi.mock('../db/pool.js', () => ({ db: { query: vi.fn(), connect: vi.fn() } }));

const enqueueCalls: Array<{ input: { assetId: string; reason: string }; opts?: { jobId?: string } }> = [];
vi.mock('../lib/queues.js', () => ({
  enqueueMediaIngestJob: vi.fn(async (input: { assetId: string; reason: string }, opts?: { jobId?: string }) => {
    enqueueCalls.push({ input, opts });
  }),
}));

const { claimProcessingJob, uploadHlsOutput, listClaimableIngestJobs } = await import('../lib/media/pipeline.js');
const { reconcileMediaIngestJobs } = await import('../workers/handlers/mediaIngestReconcileHandler.js');
const { expireStaleMultipartSessions } = await import('../workers/handlers/multipartSessionSweepHandler.js');
const { db: mockedDb } = await import('../db/pool.js');

function fakePool(script: Array<{ match: string; result: Partial<QueryResult> }>) {
  const issued: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      issued.push(sql);
      for (const step of script) {
        if (sql.includes(step.match)) return { rows: [], rowCount: 0, ...step.result };
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  return { pool, client, issued };
}

const CLAIM_SQL = 'UPDATE media_processing_jobs';
const ASSET_SQL = 'UPDATE media_assets';

describe('claimProcessingJob', () => {
  it('advances media_assets.status to processing atomically with the claim', async () => {
    const { pool, client, issued } = fakePool([
      { match: CLAIM_SQL, result: { rows: [{ id: 'job-1', status: 'processing' }] } },
      { match: ASSET_SQL, result: { rowCount: 1 } },
    ]);
    const job = await claimProcessingJob(pool, 'asset-1');
    expect(job?.id).toBe('job-1');
    expect(issued[0]).toBe('BEGIN');
    expect(issued[issued.length - 1]).toBe('COMMIT');
    // Job claim must precede the asset advance inside one transaction.
    expect(issued.findIndex(s => s.includes(CLAIM_SQL))).toBeLessThan(
      issued.findIndex(s => s.includes(ASSET_SQL)),
    );
    expect(client.release).toHaveBeenCalled();
  });

  it('only claims ingest job types and reclaims stale processing locks', async () => {
    const { pool, issued } = fakePool([
      { match: CLAIM_SQL, result: { rows: [] } },
    ]);
    await claimProcessingJob(pool, 'asset-1');
    const claimSql = issued.find(s => s.includes(CLAIM_SQL))!;
    expect(claimSql).toContain("'inspect_scan_process_moderate'");
    expect(claimSql).toContain("'retry_processing'");
    expect(claimSql).not.toContain("'purge_derivatives'");
    expect(claimSql).toContain("status = 'processing'");
  });

  it('kills the job instead of processing an asset in a terminal state', async () => {
    const { pool, issued } = fakePool([
      { match: CLAIM_SQL, result: { rows: [{ id: 'job-9', status: 'processing' }] } },
      { match: ASSET_SQL, result: { rowCount: 0 } },
    ]);
    const job = await claimProcessingJob(pool, 'asset-9');
    expect(job).toBeNull();
    const deadUpdate = issued.find(
      s => s.includes(CLAIM_SQL) && s.includes("'dead'"),
    );
    expect(deadUpdate).toBeTruthy();
    expect(issued[issued.length - 1]).toBe('COMMIT');
  });

  it('rolls back when the claim query throws', async () => {
    const issued: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        issued.push(sql);
        if (sql.includes(CLAIM_SQL)) throw new Error('boom');
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const pool = { connect: async () => client } as unknown as Pool;
    await expect(claimProcessingJob(pool, 'asset-2')).rejects.toThrow('boom');
    expect(issued).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('uploadHlsOutput', () => {
  async function fakeHlsDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'hls-contract-'));
    await mkdir(path.join(dir, 'stream_0'));
    await writeFile(
      path.join(dir, 'master.m3u8'),
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nstream_0/playlist.m3u8\n',
    );
    await writeFile(
      path.join(dir, 'stream_0', 'playlist.m3u8'),
      '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6.0,\nseg_00000.m4s\n#EXT-X-ENDLIST\n',
    );
    await writeFile(path.join(dir, 'stream_0', 'init.mp4'), Buffer.from([0, 0, 0, 24]));
    await writeFile(path.join(dir, 'stream_0', 'seg_00000.m4s'), Buffer.from([1, 2, 3]));
    return dir;
  }

  it('uploads variants under stream_${i}/ keys that resolve from the master URL', async () => {
    putCalls.length = 0;
    const dir = await fakeHlsDir();
    try {
      const result = await uploadHlsOutput(dir, 'derivatives/asset-1');
      const keys = new Set(putCalls.map(c => c.key));

      // The master references "stream_0/playlist.m3u8" relative to
      // .../hls/master.m3u8 — the object must exist at hls/stream_0/...
      expect(keys.has('derivatives/asset-1/hls/master.m3u8')).toBe(true);
      expect(keys.has('derivatives/asset-1/hls/stream_0/playlist.m3u8')).toBe(true);
      expect(keys.has('derivatives/asset-1/hls/stream_0/seg_00000.m4s')).toBe(true);
      expect(result.masterPlaylistUrl).toBe(
        'https://cdn.example.com/media/derivatives/asset-1/hls/master.m3u8',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('uploads the fMP4 init.mp4 segment with a video content type', async () => {
    putCalls.length = 0;
    const dir = await fakeHlsDir();
    try {
      await uploadHlsOutput(dir, 'derivatives/asset-2');
      const init = putCalls.find(c => c.key.endsWith('stream_0/init.mp4'));
      expect(init).toBeTruthy();
      expect(init!.contentType).toContain('video');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails instead of publishing a dead canonical URL when master.m3u8 is missing', async () => {
    putCalls.length = 0;
    const dir = await mkdtemp(path.join(tmpdir(), 'hls-nomaster-'));
    try {
      await expect(uploadHlsOutput(dir, 'derivatives/asset-3')).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('listClaimableIngestJobs', () => {
  it('mirrors the claim predicate: ingest types, grace-gated pending, stale locks, processable assets only', async () => {
    const query = vi.fn(async () => ({
      rows: [{ id: 'j1', media_asset_id: 'asset-1' }],
      rowCount: 1,
    }));
    const pool = { query } as unknown as Pool;

    const jobs = await listClaimableIngestJobs(pool);
    expect(jobs).toEqual([{ id: 'j1', mediaAssetId: 'asset-1' }]);

    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    // Same claimable predicate as claimProcessingJob.
    expect(sql).toContain("'inspect_scan_process_moderate'");
    expect(sql).toContain("'retry_processing'");
    expect(sql).toContain("j.status IN ('pending', 'retry')");
    expect(sql).toContain("j.status = 'processing'");
    expect(sql).toContain('j.attempt_count < j.max_attempts');
    // Assets already terminal/quarantined must not be re-driven.
    expect(sql).toContain('JOIN media_assets a ON a.id = j.media_asset_id');
    expect(sql).toContain("'integrity_verified'");
    expect(sql).not.toContain("'publishable'");
    expect(sql).not.toContain("'quarantined'");
    // Grace + stale-lock windows are parameterized, not inline constants.
    expect(params?.[0]).toBe(60_000);
    expect(params?.[1]).toBe(30 * 60 * 1000);
  });
});

describe('reconcileMediaIngestJobs', () => {
  it('re-enqueues orphaned rows under a reconcile-scoped jobId (retained failed jobs cannot suppress it)', async () => {
    enqueueCalls.length = 0;
    (mockedDb.query as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          { id: 'j1', media_asset_id: 'asset-1' },
          { id: 'j2', media_asset_id: 'asset-2' },
        ],
        rowCount: 2,
      });

    const count = await reconcileMediaIngestJobs('scheduled');
    expect(count).toBe(2);
    expect(enqueueCalls).toHaveLength(2);
    for (const call of enqueueCalls) {
      expect(call.input.reason).toBe('reconcile:scheduled');
      // Distinct from `media_ingest_${assetId}` — BullMQ keeps a failed
      // job's jobId under removeOnFail: 200, which would suppress the
      // default id and leave the orphan undriven.
      expect(call.opts?.jobId).toContain(`media_ingest_${call.input.assetId}_recon_`);
    }
  });

  it('is a no-op when no rows are claimable', async () => {
    enqueueCalls.length = 0;
    (mockedDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await reconcileMediaIngestJobs('scheduled')).toBe(0);
    expect(enqueueCalls).toHaveLength(0);
  });

  it('dead-letters a max-attempts row holding a stale processing lock and frees its asset', async () => {
    enqueueCalls.length = 0;
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('SET status')) return { rows: [], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    (mockedDb.query as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ rows: [], rowCount: 0 })
      // No claimable rows — the dead-letter pass must still run.
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // One wedged row: 'processing', attempt_count >= max_attempts, stale lock.
      .mockResolvedValueOnce({ rows: [{ id: 'j-dead', media_asset_id: 'asset-9' }], rowCount: 1 });
    (mockedDb.connect as ReturnType<typeof vi.fn>).mockResolvedValue(client);

    expect(await reconcileMediaIngestJobs('scheduled')).toBe(0);
    expect(enqueueCalls).toHaveLength(0);

    // Job row dead-lettered and the pinned asset released to
    // 'processing_failed' inside one transaction.
    const deadUpdate = queries.find((s) => s.includes("status = 'dead'"))!;
    expect(deadUpdate).toContain("status = 'processing'");
    expect(deadUpdate).toContain('attempt_count >= max_attempts');
    const assetUpdate = queries.find((s) => s.includes("status = 'processing_failed'"))!;
    expect(assetUpdate).toContain("status = 'processing'");
    expect(queries[0]).toBe('BEGIN');
    expect(queries[queries.length - 1]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('expireStaleMultipartSessions', () => {
  const claimResult = (rows: Array<{ id: string; object_key: string; upload_id: string; bucket: string }>) =>
    ({ rows, rowCount: rows.length });
  const sessionRow = { id: 's1', object_key: 'looks/u/v.mp4', upload_id: 'up-1', bucket: 'media' };

  beforeEach(() => {
    orphanUploads = [];
  });

  it('claims expired sessions atomically and aborts their S3 uploads in the stored bucket', async () => {
    abortCalls.length = 0;
    abortError = null;
    const queries: string[] = [];
    (mockedDb.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string) => {
      queries.push(sql);
      if (sql.includes('FOR UPDATE SKIP LOCKED')) {
        return claimResult([sessionRow]);
      }
      return { rows: [], rowCount: 1 };
    });

    expect(await expireStaleMultipartSessions('scheduled')).toBe(1);
    expect(abortCalls).toEqual([{ key: 'looks/u/v.mp4', uploadId: 'up-1', bucket: 'media' }]);
    const claim = queries.find((q) => q.includes('FOR UPDATE SKIP LOCKED'))!;
    expect(claim).toContain("status = 'active'");
    expect(claim).toContain('expires_at < NOW()');
    // Retries rows whose prior S3 abort failed.
    expect(claim).toContain("status = 'expired'");
    const finalize = queries.find((q) => q.includes("SET status = 'aborted'"))!;
    expect(finalize).toContain("status = 'expired'");
  });

  it('treats NoSuchUpload as already-terminated and converges to aborted', async () => {
    abortCalls.length = 0;
    abortError = Object.assign(new Error('gone'), { name: 'NoSuchUpload' });
    const finalizeQueries: string[] = [];
    (mockedDb.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE SKIP LOCKED')) {
        return claimResult([{ ...sessionRow, object_key: 'k' }]);
      }
      finalizeQueries.push(sql);
      return { rows: [], rowCount: 1 };
    });

    expect(await expireStaleMultipartSessions('scheduled')).toBe(1);
    expect(finalizeQueries.some((q) => q.includes("SET status = 'aborted'"))).toBe(true);
  });

  it('leaves the row expired when S3 abort fails transiently', async () => {
    abortCalls.length = 0;
    abortError = new Error('S3 unreachable');
    (mockedDb.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE SKIP LOCKED')) {
        return claimResult([{ ...sessionRow, object_key: 'k' }]);
      }
      return { rows: [], rowCount: 1 };
    });

    expect(await expireStaleMultipartSessions('scheduled')).toBe(0);
    abortError = null;
  });

  it('deletes a completed-but-unreceipted object on NoSuchUpload and keeps a referenced one', async () => {
    deleteCalls.length = 0;
    abortCalls.length = 0;
    // Both sessions complete S3-side before their finalization commits.
    abortError = Object.assign(new Error('gone'), { name: 'NoSuchUpload' });
    existingObjects = new Set(['looks/u/orphan.mp4', 'looks/u/legit.mp4']);
    (mockedDb.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FOR UPDATE SKIP LOCKED')) {
        return claimResult([
          { id: 's-orphan', object_key: 'looks/u/orphan.mp4', upload_id: 'up-o', bucket: 'media' },
          { id: 's-legit', object_key: 'looks/u/legit.mp4', upload_id: 'up-l', bucket: 'media' },
        ]);
      }
      if (sql.includes('upload_finalizations')) {
        // legit.mp4 is referenced by a media_assets row; orphan.mp4 is not.
        const isLegit = params?.[1] === 'looks/u/legit.mp4';
        return { rows: isLegit ? [{ '?column?': 1 }] : [], rowCount: isLegit ? 1 : 0 };
      }
      return { rows: [], rowCount: 1 };
    });

    await expireStaleMultipartSessions('scheduled');
    // The unreceipted object is deleted; the referenced one is untouched.
    expect(deleteCalls).toEqual([{ key: 'looks/u/orphan.mp4', bucket: 'media' }]);
    // Both rows still converge to 'aborted'.
    expect(abortCalls).toHaveLength(0); // NoSuchUpload — abort threw before recording
    abortError = null;
    existingObjects = new Set();
  });

  it('aborts S3 uploads with no session row past the grace window and skips row-backed or fresh ones', async () => {
    abortCalls.length = 0;
    abortError = null;
    orphanUploads = [
      // Orphaned past the grace window — no session row → abort.
      { key: 'orphan/old.mp4', uploadId: 'up-orphan', initiated: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      // Fresh upload inside the create→insert gap — never abort.
      { key: 'fresh/new.mp4', uploadId: 'up-fresh', initiated: new Date() },
      // Old but row-backed — the DB pass owns its lifecycle, skip.
      { key: 'tracked/t.mp4', uploadId: 'up-tracked', initiated: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    ];
    // The existence check is one batched ANY() lookup per sweep.
    let checks = 0;
    (mockedDb.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FOR UPDATE SKIP LOCKED')) return { rows: [], rowCount: 0 };
      if (sql.includes('WHERE upload_id')) {
        checks += 1;
        const ids = params?.[0] as string[];
        return { rows: ids.filter((id) => id === 'up-tracked').map((id) => ({ upload_id: id })), rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    expect(await expireStaleMultipartSessions('scheduled')).toBe(1);
    expect(abortCalls).toEqual([{ key: 'orphan/old.mp4', uploadId: 'up-orphan', bucket: undefined }]);
    // One batched query covers both stale uploads; the fresh upload is
    // filtered out before the row check.
    expect(checks).toBe(1);
  });
});
