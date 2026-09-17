import type { CreatorDocument } from './document';
import {
  LOOK_DEFAULT_ASPECT_RATIO,
  POSTER_DEFAULT_ASPECT_RATIO,
  POSTER_DEFAULT_BACKGROUND,
} from './constants';

// ── Golden composition fixtures ────────────────────────────────────
// Used by editor, preview, serializer, and viewer tests to prove
// editor-to-viewer parity (WYSIWYG). These fixtures exercise the full
// range of layer types, geometry, styles, and canvas properties.

/**
 * Golden Look fixture: a 4:5 portrait collage with two media layers,
 * a cutout placeholder (decorative), text, and a product tag.
 */
export function goldenLookFixture(): CreatorDocument {
  return {
    id: 'golden_look_001',
    type: 'look',
    version: 1,
    canvas: {
      aspectRatio: LOOK_DEFAULT_ASPECT_RATIO, // 4:5 = 0.8
      background: { type: 'color', value: '#0d0d0d' },
    },
    pages: [{
      id: 'page_1',
      layers: [
        // Primary media — full-cover background image
        {
          id: 'media_primary',
          type: 'media',
          x: 0.5, y: 0.5,
          width: 1, height: 1,
          scale: 1, rotation: 0,
          zIndex: 0, locked: false, hidden: false, opacity: 1,
          payload: {
            mediaUri: 'https://cdn.thryftverse.com/golden/look-primary.jpg',
            mediaType: 'image',
            contentFit: 'cover',
            opacity: 1,
          },
        },
        // Secondary media — a cutout-style image positioned upper-right
        {
          id: 'media_secondary',
          type: 'media',
          x: 0.72, y: 0.28,
          width: 0.35, height: 0.35,
          scale: 1.1, rotation: -5,
          zIndex: 2, locked: false, hidden: false, opacity: 0.95,
          payload: {
            mediaUri: 'https://cdn.thryftverse.com/golden/look-cutout.png',
            mediaType: 'image',
            contentFit: 'contain',
            opacity: 0.95,
          },
        },
        // Decorative shape — a circle accent
        {
          id: 'decor_accent',
          type: 'decorative',
          x: 0.2, y: 0.75,
          width: 0.12, height: 0.12,
          scale: 1, rotation: 0,
          zIndex: 3, locked: false, hidden: false, opacity: 0.8,
          payload: {
            shape: 'circle',
            color: '#8b7355',
            opacity: 0.8,
          },
        },
        // Text — editorial headline
        {
          id: 'text_headline',
          type: 'text',
          x: 0.5, y: 0.88,
          width: 0.85, height: 0.08,
          scale: 1, rotation: 0,
          zIndex: 4, locked: false, hidden: false, opacity: 1,
          payload: {
            text: 'Summer Edit',
            textStyle: 'editorial',
            fill: { space: 'srgb', r: 1, g: 1, b: 1, a: 1 },
            textColor: '#ffffff',
            alignment: 'center',
            opacity: 1,
          },
        },
        // Product tag — shoppable hotspot
        {
          id: 'prod_jacket',
          type: 'product',
          x: 0.35, y: 0.45,
          width: 0.08, height: 0.08,
          scale: 1, rotation: 0,
          zIndex: 5, locked: false, hidden: false, opacity: 1,
          payload: {
            listingId: 'listing_golden_001',
            snapshotTitle: 'Vintage Leather Jacket',
            snapshotImageUrl: 'https://cdn.thryftverse.com/golden/jacket.jpg',
            snapshotPriceGbp: 85,
            availability: 'active',
            hotspotLabel: 'Vintage Leather Jacket',
          },
        },
      ],
    }],
    metadata: {
      caption: 'Golden look fixture — do not modify',
      title: 'Golden Look',
      visibility: 'public',
      allowReplies: true,
      allowReactions: true,
      allowRemix: true,
    },
    updatedAt: '2026-07-14T00:00:00.000Z',
  };
}

/**
 * Golden Poster fixture: a 9:16 portrait story with one page containing
 * an image, styled text, a product sticker, rotation, opacity, and duration.
 */
export function goldenPosterFixture(): CreatorDocument {
  return {
    id: 'golden_poster_001',
    type: 'poster',
    version: 1,
    canvas: {
      aspectRatio: POSTER_DEFAULT_ASPECT_RATIO, // 9:16 = 0.5625
      background: { type: 'color', value: POSTER_DEFAULT_BACKGROUND },
    },
    pages: [{
      id: 'page_1',
      durationMs: 5000,
      layers: [
        // Full-cover media background
        {
          id: 'media_p1',
          type: 'media',
          x: 0.5, y: 0.5,
          width: 1, height: 1,
          scale: 1, rotation: 0,
          zIndex: 0, locked: false, hidden: false, opacity: 1,
          payload: {
            mediaUri: 'https://cdn.thryftverse.com/golden/poster-bg.jpg',
            mediaType: 'image',
            contentFit: 'cover',
            opacity: 1,
          },
        },
        // Styled text — headline with rotation and partial opacity
        {
          id: 'text_styled_1',
          type: 'text',
          x: 0.5, y: 0.18,
          width: 0.8, height: 0.12,
          scale: 1.2, rotation: -3,
          zIndex: 10, locked: false, hidden: false, opacity: 0.9,
          payload: {
            text: 'New Drop',
            textStyle: 'headline',
            fill: { space: 'srgb', r: 1, g: 1, b: 1, a: 1 },
            textColor: '#ffffff',
            alignment: 'center',
            opacity: 0.9,
          },
        },
        // Caption text
        {
          id: 'caption_p1',
          type: 'text',
          x: 0.5, y: 0.85,
          width: 0.9, height: 0.1,
          scale: 1, rotation: 0,
          zIndex: 11, locked: false, hidden: false, opacity: 1,
          payload: {
            text: 'Available now — link in bio',
            textStyle: 'clean',
            fill: { space: 'srgb', r: 1, g: 1, b: 1, a: 1 },
            textColor: '#ffffff',
            alignment: 'center',
            opacity: 1,
            isCaption: true,
          },
        },
        // Product sticker
        {
          id: 'prod_sticker_1',
          type: 'product',
          x: 0.5, y: 0.5,
          width: 0.2, height: 0.1,
          scale: 1, rotation: 0,
          zIndex: 15, locked: false, hidden: false, opacity: 1,
          payload: {
            listingId: 'listing_golden_002',
            snapshotTitle: 'Limited Edition Tee',
            snapshotImageUrl: 'https://cdn.thryftverse.com/golden/tee.jpg',
            snapshotPriceGbp: 35,
            availability: 'active',
          },
        },
      ],
    }],
    metadata: {
      caption: '',
      title: 'Golden Poster',
      visibility: 'public',
      allowReplies: true,
      allowReactions: true,
      expiresInHours: 24,
      allowRemix: false,
    },
    updatedAt: '2026-07-14T00:00:00.000Z',
  };
}
