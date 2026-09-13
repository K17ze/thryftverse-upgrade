import { describe, it, expect } from 'vitest';
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
