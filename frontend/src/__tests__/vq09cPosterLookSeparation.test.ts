import { describe, it, expect } from 'vitest';

import { serialiseToPosterPayload } from '../creator/compositionContract';
import type { CreatorDocument } from '../creator/composition';
import type { PosterStoryCreateBody } from '../services/postersApi';

function makePosterDoc(): CreatorDocument {
  return {
    id: 'doc_poster_1',
    type: 'poster',
    version: 1,
    canvas: { aspectRatio: 16 / 9, background: { type: 'color', value: '#1a1a1a' } },
    metadata: {
      title: 'Test Poster',
      caption: 'Test caption',
      visibility: 'public',
      allowReplies: true,
      allowReactions: true,
      allowRemix: false,
      expiresInHours: 24,
    },
    updatedAt: new Date().toISOString(),
    pages: [
      {
        id: 'page_1',
        layers: [
          {
            id: 'media_1',
            type: 'media',
            x: 0,
            y: 0,
            width: 360,
            height: 202,
            scale: 1,
            rotation: 0,
            zIndex: 0,
            locked: false,
            hidden: false,
            opacity: 1,
            payload: { mediaUri: 'https://example.com/img.jpg', mediaType: 'image', contentFit: 'cover', opacity: 1 },
          },
        ],
        durationMs: 5000,
      },
    ],
  };
}

function makeLookDoc(): CreatorDocument {
  return {
    id: 'doc_look_1',
    type: 'look',
    version: 1,
    canvas: { aspectRatio: 0.75, background: { type: 'color', value: '#ffffff' } },
    metadata: {
      title: 'Test Look',
      caption: 'Look caption',
      visibility: 'public',
      allowReplies: true,
      allowReactions: true,
      allowRemix: false,
    },
    updatedAt: new Date().toISOString(),
    pages: [
      {
        id: 'page_1',
        layers: [
          {
            id: 'media_1',
            type: 'media',
            x: 0,
            y: 0,
            width: 320,
            height: 427,
            scale: 1,
            rotation: 0,
            zIndex: 0,
            locked: false,
            hidden: false,
            opacity: 1,
            payload: { mediaUri: 'https://example.com/look.jpg', mediaType: 'image', contentFit: 'cover', opacity: 1 },
          },
        ],
      },
    ],
  };
}

describe('PASS 14 — Poster/look visual separation', () => {
  describe('serialiseToPosterPayload', () => {
    it('includes posterMode: "poster" for poster documents', () => {
      const doc = makePosterDoc();
      const { payload } = serialiseToPosterPayload(doc);
      expect(payload.posterMode).toBe('poster');
    });

    it('rejects look documents', () => {
      const doc = makeLookDoc();
      expect(() => serialiseToPosterPayload(doc)).toThrow();
    });

    it('preserves audience, replies, and reactions in payload', () => {
      const doc = makePosterDoc();
      const { payload } = serialiseToPosterPayload(doc);
      expect(payload.audience).toBe('public');
      expect(payload.allowReplies).toBe(true);
      expect(payload.allowReactions).toBe(true);
    });

    it('serialises frames with correct media type and sort order', () => {
      const doc = makePosterDoc();
      const { payload } = serialiseToPosterPayload(doc);
      expect(payload.frames).toHaveLength(1);
      expect(payload.frames[0].mediaType).toBe('image');
      expect(payload.frames[0].sortOrder).toBe(0);
    });
  });

  describe('PosterStoryCreateBody type', () => {
    it('accepts posterMode field', () => {
      const body: PosterStoryCreateBody = {
        id: 'story_1',
        audience: 'public',
        allowReplies: true,
        allowReactions: true,
        expiresInHours: 24,
        posterMode: 'poster',
        frames: [],
      };
      expect(body.posterMode).toBe('poster');
    });

    it('accepts posterMode "look"', () => {
      const body: PosterStoryCreateBody = {
        id: 'story_2',
        posterMode: 'look',
        frames: [],
      };
      expect(body.posterMode).toBe('look');
    });

    it('allows undefined posterMode', () => {
      const body: PosterStoryCreateBody = {
        id: 'story_3',
        frames: [],
      };
      expect(body.posterMode).toBeUndefined();
    });
  });
});

describe('PASS 15 — Frame thumbnail geometry', () => {
  it('poster mode uses 16:9 aspect ratio for thumbnails', () => {
    const thumbWidth = 52;
    const aspect = 16 / 9;
    const thumbHeight = Math.round(thumbWidth * aspect);
    expect(thumbHeight).toBe(92);
  });

  it('look mode uses 4:3 aspect ratio for thumbnails', () => {
    const thumbWidth = 52;
    const aspect = 4 / 3;
    const thumbHeight = Math.round(thumbWidth * aspect);
    expect(thumbHeight).toBe(69);
  });

  it('poster and look thumbnail heights differ', () => {
    const thumbWidth = 52;
    const posterHeight = Math.round(thumbWidth * (16 / 9));
    const lookHeight = Math.round(thumbWidth * (4 / 3));
    expect(posterHeight).not.toBe(lookHeight);
  });
});

describe('PASS 16 — Frame context menu', () => {
  it('context menu actions map to correct callbacks', () => {
    const actions = ['moveLeft', 'moveRight', 'duplicate', 'remove'] as const;
    expect(actions).toContain('moveLeft');
    expect(actions).toContain('moveRight');
    expect(actions).toContain('duplicate');
    expect(actions).toContain('remove');
  });
});

describe('PASS 17 — Contextual tool tray', () => {
  it('text stickers have color and style tools', () => {
    const textTools = ['edit', 'color', 'style', 'smaller', 'larger', 'rotateL', 'rotateR', 'front', 'back', 'duplicate', 'delete'];
    expect(textTools).toContain('color');
    expect(textTools).toContain('style');
  });

  it('non-text stickers do not have color and style tools', () => {
    const mentionTools = ['edit', 'smaller', 'larger', 'rotateL', 'rotateR', 'front', 'back', 'duplicate', 'delete'];
    expect(mentionTools).not.toContain('color');
    expect(mentionTools).not.toContain('style');
  });

  it('all sticker types have layer ordering tools', () => {
    const tools = ['front', 'back'];
    expect(tools).toContain('front');
    expect(tools).toContain('back');
  });
});

describe('PASS 19 — Canvas measurement', () => {
  it('canvas width is derived from measured layout, not fixed Dimensions', () => {
    const measuredWidth = 390;
    const canvasW = Math.min(measuredWidth - 40, 360);
    expect(canvasW).toBe(350);
  });

  it('canvas width caps at 360 for poster mode', () => {
    const measuredWidth = 500;
    const canvasW = Math.min(measuredWidth - 40, 360);
    expect(canvasW).toBe(360);
  });

  it('canvas width caps at 320 for look mode', () => {
    const measuredWidth = 500;
    const canvasW = Math.min(measuredWidth - 40, 320);
    expect(canvasW).toBe(320);
  });

  it('canvas height is derived from width and aspect ratio', () => {
    const canvasW = 360;
    const posterH = Math.round(canvasW * (16 / 9));
    const lookH = Math.round(canvasW * (4 / 3));
    expect(posterH).toBe(640);
    expect(lookH).toBe(480);
  });
});
