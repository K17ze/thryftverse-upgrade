import { makeStableId } from '../../../../utils/createStableId';
import type { CreatorDocument } from './document';
import type { CreatorLayer } from './layers';
import type { CreatorBackground, CreatorPage } from './pages';
import {
  LOOK_DEFAULT_ASPECT_RATIO,
  LOOK_DEFAULT_BACKGROUND,
  POSTER_DEFAULT_ASPECT_RATIO,
  POSTER_DEFAULT_BACKGROUND,
} from './constants';

// ── Look layout helper ──────────────────────────────────────────────
// Computes initial positions/sizes for N media layers on a Look canvas
// so that multi-select never produces N identical full-bleed overlaps.
// Mirrors the layout logic in CreatorContext.autoArrangeLook but is a
// pure function usable during document seeding (before state settles).

export function computeLookLayout(layers: CreatorLayer[]): CreatorLayer[] {
  const mediaLayers = layers.filter((l) => l.type === 'media');
  const otherLayers = layers.filter((l) => l.type !== 'media');
  if (mediaLayers.length === 0) return layers;

  let arranged: CreatorLayer[];
  const n = mediaLayers.length;

  if (n === 1) {
    // 1 → hero composition
    arranged = [{ ...mediaLayers[0], x: 0.5, y: 0.5, width: 0.9, height: 0.9, scale: 1, rotation: 0 }];
  } else if (n === 2) {
    // 2 → balanced editorial pairing
    arranged = [
      { ...mediaLayers[0], x: 0.27, y: 0.5, width: 0.44, height: 0.8, scale: 1, rotation: 0 },
      { ...mediaLayers[1], x: 0.73, y: 0.5, width: 0.44, height: 0.8, scale: 1, rotation: 0 },
    ];
  } else if (n === 3) {
    // 3 → editorial (matches autoCompose.pickDefaultId for 3 assets):
    // 60% hero on the left + two 28% images stacked in the right column.
    // Coordinates are center-based (x,y = layer center in 0..1 space).
    arranged = [
      { ...mediaLayers[0], x: 0.34, y: 0.5, width: 0.6, height: 0.92, scale: 1, rotation: 0 },
      { ...mediaLayers[1], x: 0.82, y: 0.26, width: 0.28, height: 0.44, scale: 1, rotation: 0 },
      { ...mediaLayers[2], x: 0.82, y: 0.74, width: 0.28, height: 0.44, scale: 1, rotation: 0 },
    ];
  } else {
    // 4+ → scattered collage with collision avoidance
    arranged = mediaLayers.map((layer, i) => {
      const angle = (i / n) * Math.PI * 2;
      const radius = 0.28;
      const cx = 0.5 + Math.cos(angle) * radius;
      const cy = 0.5 + Math.sin(angle) * radius;
      const size = 0.34;
      return {
        ...layer,
        x: Math.max(0.18, Math.min(0.82, cx)),
        y: Math.max(0.18, Math.min(0.82, cy)),
        width: size,
        height: size,
        scale: 1,
        rotation: (i % 2 === 0 ? 1 : -1) * 4,
      };
    });
  }

  // Reassign zIndex in order, preserve non-media layers
  return [...arranged, ...otherLayers].map((l, i) => ({ ...l, zIndex: i }));
}

/**
 * Returns true when a page contains a visible media layer that fills
 * the entire canvas (width ≥ 1, height ≥ 1). In this case the media
 * is the canvas surface — no background fill should be rendered.
 */
export function hasFullBleedMedia(page: CreatorPage | undefined): boolean {
  if (!page) return false;
  return page.layers.some(
    (l) => l.type === 'media' && !l.hidden && l.width >= 1 && l.height >= 1,
  );
}

/**
 * Returns true when the canvas background is still the factory default
 * (no user customisation). When combined with a full-bleed media layer,
 * the background fill is skipped so the media IS the canvas.
 */
export function isDefaultBackground(
  bg: CreatorBackground,
  docType: 'look' | 'poster',
): boolean {
  if (bg.type !== 'color') return false;
  const defaultValue = docType === 'look' ? LOOK_DEFAULT_BACKGROUND : POSTER_DEFAULT_BACKGROUND;
  return bg.value === defaultValue;
}

// ── Document operations ────────────────────────────────────────────

export function createEmptyDocument(type: 'look' | 'poster'): CreatorDocument {
  return {
    id: makeStableId('doc'),
    type,
    version: 1,
    canvas: {
      aspectRatio: type === 'look' ? LOOK_DEFAULT_ASPECT_RATIO : POSTER_DEFAULT_ASPECT_RATIO,
      background: { type: 'color', value: type === 'look' ? LOOK_DEFAULT_BACKGROUND : POSTER_DEFAULT_BACKGROUND },
    },
    pages: [{ id: 'page_1', layers: [] }],
    metadata: {
      caption: '',
      title: '',
      visibility: 'public',
      allowReplies: true,
      allowReactions: true,
      allowRemix: false,
      ...(type === 'poster' ? { expiresInHours: 24 } : {}),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function addLayerToPage(doc: CreatorDocument, pageIndex: number, layer: CreatorLayer): CreatorDocument {
  const pages = [...doc.pages];
  const page = { ...pages[pageIndex] };
  const maxZ = page.layers.reduce((max, l) => Math.max(max, l.zIndex), 0);
  page.layers = [...page.layers, { ...layer, zIndex: maxZ + 1 }];
  pages[pageIndex] = page;
  return { ...doc, pages, updatedAt: new Date().toISOString() };
}

export function updateLayerInPage(
  doc: CreatorDocument,
  pageIndex: number,
  layerId: string,
  updates: Partial<CreatorLayer>,
): CreatorDocument {
  const pages = [...doc.pages];
  const page = { ...pages[pageIndex] };
  page.layers = page.layers.map((l) =>
    l.id === layerId ? { ...l, ...updates } as CreatorLayer : l
  );
  pages[pageIndex] = page;
  return { ...doc, pages, updatedAt: new Date().toISOString() };
}

export function removeLayerFromPage(doc: CreatorDocument, pageIndex: number, layerId: string): CreatorDocument {
  const pages = [...doc.pages];
  const page = { ...pages[pageIndex] };
  page.layers = page.layers.filter((l) => l.id !== layerId);
  pages[pageIndex] = page;
  return { ...doc, pages, updatedAt: new Date().toISOString() };
}

export function reorderLayerZ(
  doc: CreatorDocument,
  pageIndex: number,
  layerId: string,
  direction: 'front' | 'forward' | 'backward' | 'back',
): CreatorDocument {
  const pages = [...doc.pages];
  const page = { ...pages[pageIndex] };
  const sorted = [...page.layers].sort((a, b) => a.zIndex - b.zIndex);

  const idx = sorted.findIndex((l) => l.id === layerId);
  if (idx === -1) return doc;

  switch (direction) {
    case 'front': {
      const [moved] = sorted.splice(idx, 1);
      sorted.push(moved);
      break;
    }
    case 'back': {
      const [moved] = sorted.splice(idx, 1);
      sorted.unshift(moved);
      break;
    }
    case 'forward': {
      if (idx < sorted.length - 1) {
        [sorted[idx], sorted[idx + 1]] = [sorted[idx + 1], sorted[idx]];
      }
      break;
    }
    case 'backward': {
      if (idx > 0) {
        [sorted[idx], sorted[idx - 1]] = [sorted[idx - 1], sorted[idx]];
      }
      break;
    }
  }

  page.layers = sorted.map((l, i) => ({ ...l, zIndex: i }));
  pages[pageIndex] = page;
  return { ...doc, pages, updatedAt: new Date().toISOString() };
}

export function duplicateLayerInPage(doc: CreatorDocument, pageIndex: number, layerId: string): CreatorDocument {
  const pages = [...doc.pages];
  const page = { ...pages[pageIndex] };
  const layer = page.layers.find((l) => l.id === layerId);
  if (!layer) return doc;

  const maxZ = page.layers.reduce((max, l) => Math.max(max, l.zIndex), 0);
  const newLayer: CreatorLayer = {
    ...layer,
    id: makeStableId('layer', 6),
    x: Math.min(layer.x + 0.05, 0.95),
    y: Math.min(layer.y + 0.05, 0.95),
    zIndex: maxZ + 1,
  };
  page.layers = [...page.layers, newLayer];
  pages[pageIndex] = page;
  return { ...doc, pages, updatedAt: new Date().toISOString() };
}

export function getVisibleLayersSorted(page: CreatorPage): CreatorLayer[] {
  return page.layers
    .filter((l) => !l.hidden)
    .sort((a, b) => a.zIndex - b.zIndex);
}

export function getAllLayersSorted(page: CreatorPage): CreatorLayer[] {
  return [...page.layers].sort((a, b) => a.zIndex - b.zIndex);
}
