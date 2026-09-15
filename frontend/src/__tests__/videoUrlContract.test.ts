import { describe, it, expect } from 'vitest';
import { isVideoUri } from '../utils/media';
import { isVideoUrl } from '../utils/posterPhysics';

// ---------------------------------------------------------------------------
// Video URL contract — with canonical_url now an HLS master playlist for
// every processed video, every surface that branches on "is this a video?"
// must recognise .m3u8. A missed case feeds a playlist into an image loader
// (broken tile) or saves playlist text as a .mp4 (corrupt download).
// ---------------------------------------------------------------------------

describe('isVideoUri (utils/media)', () => {
  it('recognises plain video extensions', () => {
    expect(isVideoUri('https://cdn.example.com/clip.mp4')).toBe(true);
    expect(isVideoUri('https://cdn.example.com/clip.mov')).toBe(true);
    expect(isVideoUri('https://cdn.example.com/clip.webm')).toBe(true);
  });

  it('recognises HLS master playlists', () => {
    expect(isVideoUri('https://cdn.example.com/hls/master.m3u8')).toBe(true);
  });

  it('recognises m3u8 with query strings (signed URLs)', () => {
    expect(isVideoUri('https://cdn.example.com/hls/master.m3u8?sig=abc&exp=1')).toBe(true);
  });

  it('does not match images', () => {
    expect(isVideoUri('https://cdn.example.com/poster.jpg')).toBe(false);
    expect(isVideoUri('https://cdn.example.com/photo.png?v=2')).toBe(false);
  });

  it('handles nullish input', () => {
    expect(isVideoUri(undefined)).toBe(false);
    expect(isVideoUri(null)).toBe(false);
    expect(isVideoUri('')).toBe(false);
  });
});

describe('isVideoUrl (utils/posterPhysics)', () => {
  it('recognises m3u8 — adaptive playlists are video', () => {
    expect(isVideoUrl('https://cdn.example.com/hls/master.m3u8')).toBe(true);
  });

  it('recognises m3u8 with a signed query string', () => {
    expect(isVideoUrl('https://cdn.example.com/hls/master.m3u8?X-Amz-Signature=deadbeef')).toBe(true);
  });

  it('recognises progressive video', () => {
    expect(isVideoUrl('https://cdn.example.com/render.mp4')).toBe(true);
  });

  it('does not match stills — image loaders must never see a video URL', () => {
    expect(isVideoUrl('https://cdn.example.com/poster.jpg')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Camera-roll save contract — an m3u8 must never be downloaded as a playable
// file. Mirrors the guard in PosterViewerScreen.handleSaveToCameraRoll.
// ---------------------------------------------------------------------------

const M3U8_RE = /\.m3u8(\?|#|$)/i;

describe('camera-roll save guard', () => {
  it('blocks playlist saves even when signed', () => {
    expect(M3U8_RE.test('https://cdn.example.com/hls/master.m3u8?sig=x')).toBe(true);
    expect(M3U8_RE.test('https://cdn.example.com/hls/master.m3u8')).toBe(true);
  });

  it('allows progressive MP4 downloads', () => {
    expect(M3U8_RE.test('https://cdn.example.com/render.mp4?sig=x')).toBe(false);
    expect(M3U8_RE.test('https://cdn.example.com/render.mp4')).toBe(false);
  });
});
