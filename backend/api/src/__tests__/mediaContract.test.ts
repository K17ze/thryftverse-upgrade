import { afterEach, describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { createMultipartUpload, internalS3 } from '../lib/s3.js';
import { registerUploadRoutes } from '../routes/uploads.js';

vi.mock('../lib/queues.js', () => ({ enqueueMediaIngestJob: vi.fn(async () => 'queued') }));
import sharp from 'sharp';
import type { Pool, PoolClient } from 'pg';
import { Buffer } from 'node:buffer';
import {
  encodeBlurHash,
  generateImageDerivatives,
  stripImageExif,
} from '../lib/media/sharpPipeline.js';
import {
  loadListingMedia,
  listingImageUrls,
  listingMediaImageUrl,
  type ListingMediaItem,
} from '../lib/media/listingMediaProjection.js';

// ---------------------------------------------------------------------------
// BlurHash — the field previously stored a truncated SHA-256 hex digest that
// no decoder can render. The contract now requires a real BlurHash.
// ---------------------------------------------------------------------------

const BASE83 =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

describe('encodeBlurHash', () => {
  it('emits a spec-length Base83 string for 4x3 components', () => {
    // 1 size flag + 1 max-AC + 4 DC + 2 × 11 AC = 28 chars.
    const pixels = new Uint8Array(32 * 32 * 4).fill(128);
    const hash = encodeBlurHash(pixels, 32, 32);
    expect(hash).toHaveLength(28);
    for (const ch of hash) {
      expect(BASE83).toContain(ch);
    }
    // Not the legacy placeholder: a 32-char lowercase hex digest.
    expect(hash).not.toMatch(/^[0-9a-f]{32}$/);
  });

  it('encodes the DC component as the dominant sRGB colour', () => {
    // Solid red image — the DC factor decodes back to (255, 0, 0).
    const pixels = new Uint8Array(16 * 16 * 4);
    for (let i = 0; i < 16 * 16; i += 1) {
      pixels[i * 4] = 255;
      pixels[i * 4 + 1] = 0;
      pixels[i * 4 + 2] = 0;
      pixels[i * 4 + 3] = 255;
    }
    const hash = encodeBlurHash(pixels, 16, 16);
    // DC occupies chars [2..6): 4 Base83 digits big-endian.
    let dc = 0;
    for (const ch of hash.slice(2, 6)) {
      dc = dc * 83 + BASE83.indexOf(ch);
    }
    expect(dc >> 16).toBe(255);
    // linearTosRGB(0) in the reference algorithm yields 1
    // (Math.round(0.5) rounds up) — allow that single LSB.
    expect((dc >> 8) & 0xff).toBeLessThanOrEqual(1);
    expect(dc & 0xff).toBeLessThanOrEqual(1);
  });

  it('rejects undersized pixel buffers instead of fabricating a hash', () => {
    expect(() => encodeBlurHash(new Uint8Array(4), 8, 8)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// EXIF orientation + ICC — the privacy strip previously re-encoded without
// applying the Orientation tag, serving sideways pixels and dropping the
// embedded colour profile.
// ---------------------------------------------------------------------------

async function makeRotatedJpeg(): Promise<Buffer> {
  // 60x40 source stored with EXIF orientation 6 → displays as 40x60.
  return sharp({
    create: { width: 60, height: 40, channels: 3, background: { r: 40, g: 120, b: 200 } },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

describe('stripImageExif', () => {
  it('bakes the EXIF orientation into the pixels and drops the tag', async () => {
    const source = await makeRotatedJpeg();
    const cleaned = await stripImageExif(source, 'image/jpeg');
    const meta = await sharp(cleaned).metadata();
    // Orientation 6 swaps the axes: coded 60x40 → delivered 40x60.
    expect(meta.width).toBe(40);
    expect(meta.height).toBe(60);
    expect(meta.orientation ?? 1).toBe(1);
  });
});

describe('generateImageDerivatives', () => {
  it('reports post-orientation source geometry', async () => {
    const source = await makeRotatedJpeg();
    const result = await generateImageDerivatives(source);
    expect(result.sourceWidth).toBe(40);
    expect(result.sourceHeight).toBe(60);
    // Every rendition inherits the corrected (portrait) orientation —
    // a rotated source must not produce landscape derivatives.
    for (const d of result.derivatives) {
      expect(d.width).toBeLessThanOrEqual(40);
      expect(d.height).toBeGreaterThanOrEqual(d.width);
    }
    expect(result.lqip.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(result.blurhash).not.toBeNull();
    expect(result.blurhash).not.toMatch(/^[0-9a-f]{32}$/);
  });
});

// ---------------------------------------------------------------------------
// loadListingMedia — the read seam. Verifies projection shape, hex-digest
// filtering and the defensive fallback when lifecycle tables are absent.
// ---------------------------------------------------------------------------

type QueryResponder = (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

function fakeDb(respond: QueryResponder) {
  const calls: string[] = [];
  const query = async <T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }> => {
    calls.push(text);
    return respond(text, params) as Promise<{ rows: T[] }>;
  };
  // The production Queryable contract is pg's overloaded `query` — the fake
  // only needs the (text, params) overload, so assert the narrower shape.
  return {
    calls,
    query: query as unknown as Pick<Pool | PoolClient, 'query'>['query'],
  };
}

const IMAGE_ROW = {
  id: 'li_1',
  listing_id: 'lst_1',
  image_url: 'https://cdn.example.com/a.jpg',
  sort_order: 0,
  media_width: 800,
  media_height: 600,
  media_type: 'image',
  poster_url: null,
  poster_verified_at: null,
  image_blurhash: '9f8f2a1c3e4b5d6a7f8e9d0c1b2a3f4e', // legacy 32-hex placeholder
  focal_x: '0.4',
  focal_y: '0.6',
  media_asset_id: 'ma_1',
  asset_blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.',
  lqip: 'data:image/jpeg;base64,AAAA',
};

const DERIVATIVE_ROW = {
  media_asset_id: 'ma_1',
  variant: 'webp_400w',
  content_type: 'image/webp',
  width: 400,
  height: 300,
  canonical_url: 'https://cdn.example.com/d/webp_400w.webp',
};

describe('loadListingMedia', () => {
  it('projects the canonical media contract with derivatives and placeholders', async () => {
    const db = fakeDb(async (text) => {
      if (text.includes('FROM media_derivatives')) return { rows: [DERIVATIVE_ROW] };
      return { rows: [IMAGE_ROW] };
    });

    const map = await loadListingMedia(db, ['lst_1']);
    const items = map.get('lst_1') as ListingMediaItem[];
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.uri).toBe('https://cdn.example.com/a.jpg');
    expect(item.url).toBe(item.uri);
    expect(item.kind).toBe('image');
    expect(item.width).toBe(800);
    expect(item.height).toBe(600);
    expect(item.focalPoint).toEqual({ x: 0.4, y: 0.6 });
    // Undecodable hex placeholder filtered → asset-computed blurhash wins.
    expect(item.blurhash).toBe('LGF5]+Yk^6#M@-5c,1J5@[or[Q6.');
    expect(item.lqip).toBe('data:image/jpeg;base64,AAAA');
    expect(item.derivatives).toHaveLength(1);
    expect(item.derivatives[0].url).toBe(DERIVATIVE_ROW.canonical_url);
    expect(item.derivatives[0].format).toBe('webp');
  });

  it('falls back to the flat projection when lifecycle tables are absent', async () => {
    let first = true;
    const db = fakeDb(async () => {
      if (first) {
        first = false;
        throw new Error('relation "media_bindings" does not exist');
      }
      return {
        rows: [{ ...IMAGE_ROW, media_asset_id: null, asset_blurhash: null, lqip: null }],
      };
    });

    const map = await loadListingMedia(db, ['lst_1']);
    const items = map.get('lst_1');
    expect(items).toHaveLength(1);
    expect(items![0].blurhash).toBeNull(); // hex placeholder filtered, no asset fallback
    expect(items![0].derivatives).toEqual([]);
    expect(db.calls).toHaveLength(2);
  });

  it('issues no queries for an empty listing set', async () => {
    const db = fakeDb(async () => ({ rows: [] }));
    const map = await loadListingMedia(db, []);
    expect(map.size).toBe(0);
    expect(db.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// listingImageUrls — `images[]`/`imageUrl` are image-context fields. A video
// item's `uri` may be an HLS playlist (`canonical_url`), which no image
// loader can decode — the poster still must be projected instead.
// ---------------------------------------------------------------------------

const VIDEO_ROW = {
  ...IMAGE_ROW,
  id: 'li_vid',
  image_url: 'https://cdn.example.com/hls/master.m3u8',
  media_type: 'video',
  poster_url: 'https://cdn.example.com/hls/poster.jpg',
};

describe('listingImageUrls', () => {
  it('projects the poster still for video media, never the playlist', async () => {
    const db = fakeDb(async (text) =>
      text.includes('FROM media_derivatives') ? { rows: [] } : { rows: [VIDEO_ROW] });
    const map = await loadListingMedia(db, ['lst_1']);
    const items = map.get('lst_1') as ListingMediaItem[];
    // `media[]` keeps the playable playlist + poster pair…
    expect(items[0].uri).toBe('https://cdn.example.com/hls/master.m3u8');
    expect(items[0].kind).toBe('video');
    // …but `images[]`/`imageUrl` are image contexts and must get the still.
    expect(listingMediaImageUrl(items[0])).toBe('https://cdn.example.com/hls/poster.jpg');
    expect(listingImageUrls(items, null)).toEqual([
      'https://cdn.example.com/hls/poster.jpg',
    ]);
  });

  it('falls back to the uri when a video poster does not exist yet', () => {
    const item = {
      kind: 'video',
      uri: 'https://cdn.example.com/hls/master.m3u8',
      poster: null,
    } as ListingMediaItem;
    expect(listingMediaImageUrl(item)).toBe(item.uri);
  });

  it('returns the fallback image url only when no media items exist', () => {
    expect(listingImageUrls(undefined, 'https://cdn.example.com/cover.jpg')).toEqual([
      'https://cdn.example.com/cover.jpg',
    ]);
    expect(listingImageUrls([], 'https://cdn.example.com/cover.jpg')).toEqual([
      'https://cdn.example.com/cover.jpg',
    ]);
  });
});

describe('multipart recovery contract', () => {
  const apps: ReturnType<typeof Fastify>[] = [];
  const sizeBytes = 15 * 1024 * 1024;
  const publicUrl = 'https://cdn.example.test/media/looks/user-1/video.mp4';
  const parts = [1, 2, 3].map((partNumber) => ({ partNumber, etag: `etag-${partNumber}` }));

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    vi.restoreAllMocks();
  });

  function harness(overrides: { status?: string; initiatedAt?: number; expiresAt?: number; finalized?: boolean; raceLost?: boolean } = {}) {
    const session = {
      upload_id: 's3-1', object_key: 'looks/user-1/video.mp4', bucket: config.s3Bucket,
      owner_id: 'user-1', folder: 'looks', content_type: 'video/mp4',
      size_bytes: String(sizeBytes), part_count: 3, status: overrides.status ?? 'active',
      initiated_at: new Date(overrides.initiatedAt ?? Date.now()).toISOString(),
      expires_at: new Date(overrides.expiresAt ?? Date.now() + 600_000).toISOString(),
    };
    const receipt = {
      id: 'fin-1', object_key: session.object_key, bucket: session.bucket,
      owner_id: session.owner_id, folder: 'looks', file_name: 'video.mp4',
      content_type: 'video/mp4', size_bytes: String(sizeBytes), public_url: publicUrl,
      scope: 'general', metadata: {}, media_asset_id: 'asset-1',
      asset_status: 'published', media_kind: 'video', canonical_url: 'https://cdn.example.test/master.m3u8',
    };
    let finalized = overrides.finalized ?? false;
    const writes: Array<{ sql: string; values?: unknown[] }> = [];
    const query = vi.fn(async (text: string, values?: unknown[]) => {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.includes('FROM upload_multipart_sessions')) return { rowCount: 1, rows: [session] };
      if (sql.includes('FROM upload_finalizations')) return { rowCount: finalized ? 1 : 0, rows: finalized ? [receipt] : [] };
      if (sql.startsWith('INSERT INTO upload_multipart_sessions')) {
        writes.push({ sql, values });
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith('UPDATE upload_multipart_sessions')) {
        writes.push({ sql, values });
        if (overrides.raceLost) return { rowCount: 0, rows: [] };
        session.status = sql.includes("'aborted'") ? 'aborted' : 'completed';
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith('INSERT INTO upload_finalizations')) {
        finalized = true;
        writes.push({ sql, values });
        return { rowCount: 1, rows: [receipt] };
      }
      if (sql.startsWith('INSERT INTO media_assets')) return { rowCount: 1, rows: [{
        id: 'asset-1', status: 'published', media_kind: 'video', canonical_url: receipt.canonical_url,
      }] };
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK'
        || sql.startsWith('UPDATE upload_finalizations') || sql.startsWith('INSERT INTO media_processing_jobs')) {
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected test query: ${sql}`);
    });
    const db = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
    const app = Fastify();
    apps.push(app);
    registerUploadRoutes({
      app, db, createApiError: (_code, message) => Object.assign(new Error(message), { statusCode: 400 }),
      resolveAuthenticatedUserId: (request) => String(request.headers['x-test-user'] ?? 'user-1'),
    });
    return { app, session, receipt, writes, query };
  }

  function mockStorage() {
    return vi.spyOn(internalS3, 'send').mockImplementation(async (command) => {
      if (command instanceof CreateMultipartUploadCommand) return { UploadId: 's3-1' };
      if (command instanceof CompleteMultipartUploadCommand) return { Location: publicUrl };
      if (command instanceof AbortMultipartUploadCommand) return {};
      if (command instanceof HeadObjectCommand) return { ContentType: 'video/mp4', ContentLength: sizeBytes };
      throw new Error('Unexpected storage operation');
    });
  }

  it.each(['image/jpeg', 'audio/mp4'])('initiates allowed %s multipart with its real size', async (contentType) => {
    mockStorage();
    const { app } = harness();
    const response = await app.inject({ method: 'POST', url: '/uploads/multipart/initiate', payload: {
      fileName: 'asset', contentType, sizeBytes, partSize: 5 * 1024 * 1024, folder: 'looks',
    } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, uploadId: 's3-1', partCount: 3 });
  });

  it('keeps the session alive for seven days without extending signed URL lifetimes', async () => {
    mockStorage();
    const { app, writes } = harness();
    const before = Date.now();
    const response = await app.inject({ method: 'POST', url: '/uploads/multipart/initiate', payload: {
      fileName: 'video.mp4', contentType: 'video/mp4', sizeBytes, partSize: 5 * 1024 * 1024,
    } });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Date.parse(body.expiresAt)).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000);
    expect(body.presignedParts[0].expiresInSeconds).toBe(config.s3PresignTtlSeconds);
    expect(writes[0].values?.[9]).toBe(body.expiresAt);
  });

  it('refreshes part URLs for a legacy session interrupted overnight', async () => {
    const { app } = harness({ initiatedAt: Date.now() - 12 * 60 * 60 * 1000, expiresAt: Date.now() - 11 * 60 * 60 * 1000 });
    const response = await app.inject({ method: 'POST', url: '/uploads/multipart/session-1/parts', payload: { partNumbers: [2] } });
    expect(response.statusCode).toBe(200);
    expect(response.json().presignedParts[0].partNumber).toBe(2);
    expect(Date.parse(response.json().expiresAt)).toBeGreaterThan(Date.now());
  });

  it('does not renew a truly expired session indefinitely', async () => {
    const { app } = harness({ initiatedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, expiresAt: Date.now() - 7 * 24 * 60 * 60 * 1000 });
    const response = await app.inject({ method: 'POST', url: '/uploads/multipart/session-1/parts', payload: { partNumbers: [2] } });
    expect(response.statusCode).toBe(410);
  });

  it('rejects part numbers beyond the declared file before signing', async () => {
    const { app } = harness();
    const response = await app.inject({ method: 'POST', url: '/uploads/multipart/session-1/parts', payload: { partNumbers: [4] } });
    expect(response.statusCode).toBe(400);
  });

  it('returns the full media contract when completion is replayed after expiry', async () => {
    const send = mockStorage();
    const { app, receipt } = harness({ status: 'completed', finalized: true, expiresAt: Date.now() - 1000 });
    const response = await app.inject({ method: 'POST', url: '/uploads/multipart/session-1/complete', payload: { parts } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true, duplicate: true, finalizationId: receipt.id, objectKey: receipt.object_key,
      publicUrl, sizeBytes, contentType: 'video/mp4', mediaAsset: {
        id: 'asset-1', status: 'published', canonicalUrl: receipt.canonical_url, publishable: true, processingRequired: false,
      },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('does not expose replay receipts to another owner', async () => {
    const send = mockStorage();
    const { app } = harness({ status: 'completed', finalized: true });
    const response = await app.inject({ method: 'POST', url: '/uploads/multipart/session-1/complete', headers: { 'x-test-user': 'other' }, payload: { parts } });
    expect(response.statusCode).toBe(403);
    expect(send).not.toHaveBeenCalled();
    expect(response.json().finalizationId).toBeUndefined();
  });

  it('repairs completion interrupted after assembly but before the receipt transaction', async () => {
    const send = mockStorage();
    const { app, writes } = harness({ status: 'completed' });
    const response = await app.inject({ method: 'POST', url: '/uploads/multipart/session-1/complete', payload: { parts } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ finalizationId: 'fin-1', mediaAsset: { id: 'asset-1' } });
    expect(send.mock.calls.some(([command]) => command instanceof CompleteMultipartUploadCommand)).toBe(false);
    expect(send.mock.calls.some(([command]) => command instanceof HeadObjectCommand)).toBe(true);
    expect(writes.some(({ sql }) => sql.startsWith('INSERT INTO upload_finalizations'))).toBe(true);
  });

  it('recovers when S3 assembled the file but the completion response was lost', async () => {
    const send = mockStorage();
    send.mockImplementation(async (command) => {
      if (command instanceof CompleteMultipartUploadCommand) throw Object.assign(new Error('Already assembled'), { name: 'NoSuchUpload' });
      if (command instanceof HeadObjectCommand) return { ContentType: 'video/mp4', ContentLength: sizeBytes };
      throw new Error('Unexpected storage operation');
    });
    const { app } = harness();
    const response = await app.inject({ method: 'POST', url: '/uploads/multipart/session-1/complete', payload: { parts } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ finalizationId: 'fin-1', mediaAsset: { id: 'asset-1' } });
  });

  it('does not turn missing S3 uploads into successful receipts', async () => {
    const send = mockStorage();
    send.mockRejectedValue(Object.assign(new Error('Missing'), { name: 'NoSuchUpload' }));
    const { app, writes } = harness();
    const response = await app.inject({ method: 'POST', url: '/uploads/multipart/session-1/complete', payload: { parts } });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(writes).toHaveLength(0);
  });

  it('rejects incomplete or duplicate part manifests before assembly', async () => {
    const send = mockStorage();
    const { app } = harness();
    for (const invalidParts of [parts.slice(0, 2), [parts[0], parts[0], parts[2]]]) {
      const response = await app.inject({ method: 'POST', url: '/uploads/multipart/session-1/complete', payload: { parts: invalidParts } });
      expect(response.statusCode).toBe(400);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('maps deterministic S3 manifest rejections to 400 instead of a retryable 500', async () => {
    const send = mockStorage();
    send.mockImplementation(async (command) => {
      if (command instanceof CompleteMultipartUploadCommand) throw Object.assign(new Error('Bad part'), { name: 'InvalidPart' });
      throw new Error('Unexpected storage operation');
    });
    const { app, writes } = harness();
    const response = await app.inject({ method: 'POST', url: '/uploads/multipart/session-1/complete', payload: { parts } });
    expect(response.statusCode).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it('returns 422 when the assembled object violates the declared upload policy', async () => {
    const send = mockStorage();
    send.mockImplementation(async (command) => {
      if (command instanceof CompleteMultipartUploadCommand) return { Location: publicUrl };
      if (command instanceof HeadObjectCommand) return { ContentType: 'video/mp4', ContentLength: sizeBytes - 1 };
      throw new Error('Unexpected storage operation');
    });
    const { app, writes } = harness();
    const response = await app.inject({ method: 'POST', url: '/uploads/multipart/session-1/complete', payload: { parts } });
    expect(response.statusCode).toBe(422);
    expect(writes).toHaveLength(0);
  });

  it('does not let a lost lifecycle race overwrite the winning state', async () => {
    const send = mockStorage();
    const { app } = harness({ raceLost: true });
    const complete = await app.inject({ method: 'POST', url: '/uploads/multipart/session-1/complete', payload: { parts } });
    expect(complete.statusCode).toBe(409);
    const abort = await app.inject({ method: 'POST', url: '/uploads/multipart/session-1/abort' });
    expect(abort.statusCode).toBe(409);
    expect(send).toHaveBeenCalled();
  });

  it('keeps transient verification failures retryable and does not mark the session completed', async () => {
    const send = mockStorage();
    send.mockImplementation(async (command) => {
      if (command instanceof CompleteMultipartUploadCommand) return { Location: publicUrl };
      throw new Error('Storage temporarily unavailable');
    });
    const { app, writes } = harness();
    const response = await app.inject({ method: 'POST', url: '/uploads/multipart/session-1/complete', payload: { parts } });
    expect(response.statusCode).toBe(500);
    expect(writes).toHaveLength(0);
  });

  it('retains per-type size enforcement inside the S3 helper', async () => {
    const send = mockStorage();
    await expect(createMultipartUpload('test/too-large.jpg', 'image/jpeg', {
      sizeBytes: config.s3MaxImageUploadBytes + 1,
    })).rejects.toThrow('UPLOAD_SIZE_NOT_ALLOWED');
    expect(send).not.toHaveBeenCalled();
  });
});
