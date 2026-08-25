import { createStableId, makeStableId } from '../utils/createStableId';
import type { CreatorDocument, CreatorLayer, CreatorPage } from './composition';

export interface CreatorTemplate {
  id: string;
  name: string;
  type: 'look' | 'poster';
  description: string;
  category: 'featured' | 'announcement' | 'interactive' | 'story' | 'editorial' | 'sale' | 'moodboard';
  /** Optional style tags used to sort templates by user preferences. */
  styleTags?: string[];
  build: () => CreatorDocument;
}

function page(layers: CreatorLayer[], durationMs?: number): CreatorPage {
  return { id: makeStableId('page'), layers, durationMs };
}

function baseLayer(id: string, zIndex: number): Pick<CreatorLayer, 'id' | 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'zIndex' | 'locked' | 'hidden'> {
  return {
    id,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    opacity: 1,
    zIndex,
    locked: false,
    hidden: false,
  };
}

export const LOOK_TEMPLATES: CreatorTemplate[] = [
  {
    id: 'tpl_look_single_photo',
    name: 'Single Photo',
    type: 'look',
    description: 'Editorial single-photo layout',
    category: 'editorial',
    styleTags: ['Minimal', 'Archive'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 0.75, background: { type: 'color', value: '#1a1a1a' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.85, height: 0.85, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
      ])],
      metadata: { title: 'Editorial Look', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_outfit_board',
    name: 'Outfit Board',
    type: 'look',
    description: 'Three-piece outfit grid',
    category: 'editorial',
    styleTags: ['Streetwear', 'Techwear'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 1, background: { type: 'color', value: '#f5f5f5' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.4, height: 0.4, x: 0.3, y: 0.3, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.4, height: 0.4, x: 0.7, y: 0.3, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 3), type: 'media', width: 0.4, height: 0.4, x: 0.5, y: 0.7, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
      ])],
      metadata: { title: 'Outfit Board', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_product_grid',
    name: 'Product Grid',
    type: 'look',
    description: 'Minimal product grid layout',
    category: 'editorial',
    styleTags: ['Minimal'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 0.8, background: { type: 'color', value: '#ffffff' } },
      pages: [page([
        { ...baseLayer(createStableId('product'), 1), type: 'product', width: 0.3, height: 0.15, x: 0.3, y: 0.25, payload: { listingId: '', snapshotTitle: 'Item 1', snapshotPriceGbp: 0, availability: 'active' } },
        { ...baseLayer(createStableId('product'), 2), type: 'product', width: 0.3, height: 0.15, x: 0.7, y: 0.25, payload: { listingId: '', snapshotTitle: 'Item 2', snapshotPriceGbp: 0, availability: 'active' } },
        { ...baseLayer(createStableId('product'), 3), type: 'product', width: 0.3, height: 0.15, x: 0.3, y: 0.5, payload: { listingId: '', snapshotTitle: 'Item 3', snapshotPriceGbp: 0, availability: 'active' } },
        { ...baseLayer(createStableId('product'), 4), type: 'product', width: 0.3, height: 0.15, x: 0.7, y: 0.5, payload: { listingId: '', snapshotTitle: 'Item 4', snapshotPriceGbp: 0, availability: 'active' } },
      ])],
      metadata: { title: 'Product Grid', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_magazine',
    name: 'Magazine',
    type: 'look',
    description: 'Magazine-style editorial layout',
    category: 'editorial',
    styleTags: ['Archive', 'Vintage'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 0.75, background: { type: 'color', value: '#1a1a1a' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.9, height: 0.7, y: 0.4, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('text'), 2), type: 'text', width: 0.8, height: 0.1, y: 0.85, payload: { text: 'EDITORIAL', textStyle: 'headline', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
      ])],
      metadata: { title: 'Magazine Look', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_colour_story',
    name: 'Colour Story',
    type: 'look',
    description: 'Colour-focused story layout',
    category: 'editorial',
    styleTags: ['Gorpcore', 'Vintage'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 1, background: { type: 'color', value: '#2c2c2c' } },
      pages: [page([
        { ...baseLayer(createStableId('decorative'), 1), type: 'decorative', width: 0.5, height: 0.5, x: 0.3, y: 0.3, payload: { shape: 'circle', color: '#9A6B7A', opacity: 0.8 } },
        { ...baseLayer(createStableId('decorative'), 2), type: 'decorative', width: 0.4, height: 0.4, x: 0.7, y: 0.7, payload: { shape: 'circle', color: '#215634', opacity: 0.6 } },
        { ...baseLayer(createStableId('text'), 3), type: 'text', width: 0.6, height: 0.08, y: 0.9, payload: { text: 'Colour Story', textStyle: 'editorial', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
      ])],
      metadata: { title: 'Colour Story', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  // ── Instagram Layout-style grid presets ──────────────────────────
  {
    id: 'tpl_look_split_2',
    name: 'Split 2',
    type: 'look',
    description: 'Two-photo vertical split',
    category: 'editorial',
    styleTags: ['Streetwear', 'Archive'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 1, background: { type: 'color', value: '#0A0A0A' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.48, height: 0.96, x: 0.25, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.48, height: 0.96, x: 0.75, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
      ])],
      metadata: { title: 'Split Look', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_horizontal_3',
    name: 'Triple',
    type: 'look',
    description: 'Three-photo horizontal strip',
    category: 'editorial',
    styleTags: ['Streetwear', 'Techwear'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 1, background: { type: 'color', value: '#0A0A0A' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.31, height: 0.96, x: 0.17, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.31, height: 0.96, x: 0.5, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 3), type: 'media', width: 0.31, height: 0.96, x: 0.83, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
      ])],
      metadata: { title: 'Triple Look', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_grid_4',
    name: 'Grid 4',
    type: 'look',
    description: 'Four-photo grid collage',
    category: 'editorial',
    styleTags: ['Streetwear', 'Gorpcore'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 1, background: { type: 'color', value: '#0A0A0A' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.47, height: 0.47, x: 0.26, y: 0.26, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.47, height: 0.47, x: 0.74, y: 0.26, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 3), type: 'media', width: 0.47, height: 0.47, x: 0.26, y: 0.74, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 4), type: 'media', width: 0.47, height: 0.47, x: 0.74, y: 0.74, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
      ])],
      metadata: { title: 'Grid Look', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_grid_6',
    name: 'Grid 6',
    type: 'look',
    description: 'Six-photo grid collage',
    category: 'editorial',
    styleTags: ['Gorpcore', 'Techwear'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 1, background: { type: 'color', value: '#0A0A0A' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.31, height: 0.31, x: 0.17, y: 0.17, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.31, height: 0.31, x: 0.5, y: 0.17, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 3), type: 'media', width: 0.31, height: 0.31, x: 0.83, y: 0.17, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 4), type: 'media', width: 0.31, height: 0.31, x: 0.17, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 5), type: 'media', width: 0.31, height: 0.31, x: 0.5, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 6), type: 'media', width: 0.31, height: 0.31, x: 0.83, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
      ])],
      metadata: { title: 'Grid 6 Look', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_feature_split',
    name: 'Feature',
    type: 'look',
    description: 'Large feature photo with two side photos',
    category: 'editorial',
    styleTags: ['Archive', 'Vintage'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 1, background: { type: 'color', value: '#0A0A0A' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.6, height: 0.96, x: 0.32, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.34, height: 0.47, x: 0.82, y: 0.26, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 3), type: 'media', width: 0.34, height: 0.47, x: 0.82, y: 0.74, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
      ])],
      metadata: { title: 'Feature Look', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  // ── Instagram parity: extended look presets ───────────────────────
  {
    id: 'tpl_look_dual_photo',
    name: 'Dual Photo',
    type: 'look',
    description: 'Side-by-side comparison layout',
    category: 'editorial',
    styleTags: ['Minimal', 'Archive'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 1, background: { type: 'color', value: '#0A0A0A' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.48, height: 0.9, x: 0.26, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.48, height: 0.9, x: 0.74, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
      ])],
      metadata: { title: 'Dual Photo', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_portrait_strip',
    name: 'Portrait Strip',
    type: 'look',
    description: 'Vertical strip of three photos',
    category: 'editorial',
    styleTags: ['Vintage', 'Archive'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 0.8, background: { type: 'color', value: '#1a1a1a' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.7, height: 0.3, x: 0.5, y: 0.18, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.7, height: 0.3, x: 0.5, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 3), type: 'media', width: 0.7, height: 0.3, x: 0.5, y: 0.82, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
      ])],
      metadata: { title: 'Portrait Strip', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_checkerboard',
    name: 'Checkerboard',
    type: 'look',
    description: '2x2 grid with alternating media and colour',
    category: 'editorial',
    styleTags: ['Streetwear', 'Vintage'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 1, background: { type: 'color', value: '#C9A46A' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.47, height: 0.47, x: 0.26, y: 0.26, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('decorative'), 2), type: 'decorative', width: 0.47, height: 0.47, x: 0.74, y: 0.26, payload: { shape: 'square', color: '#1a1a1a', opacity: 1 } },
        { ...baseLayer(createStableId('decorative'), 3), type: 'decorative', width: 0.47, height: 0.47, x: 0.26, y: 0.74, payload: { shape: 'square', color: '#1a1a1a', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 4), type: 'media', width: 0.47, height: 0.47, x: 0.74, y: 0.74, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
      ])],
      metadata: { title: 'Checkerboard', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_diagonal_split',
    name: 'Diagonal Split',
    type: 'look',
    description: 'Diagonal split two-photo layout',
    category: 'editorial',
    styleTags: ['Techwear', 'Streetwear'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 1, background: { type: 'color', value: '#0A0A0A' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.7, height: 0.7, x: 0.35, y: 0.35, rotation: -15, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.7, height: 0.7, x: 0.65, y: 0.65, rotation: 15, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('decorative'), 3), type: 'decorative', width: 1.2, height: 0.02, x: 0.5, y: 0.5, rotation: 45, payload: { shape: 'line', color: '#C9A46A', opacity: 1 } },
      ])],
      metadata: { title: 'Diagonal Split', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_circle_frame',
    name: 'Circle Frame',
    type: 'look',
    description: 'Central circular photo with border',
    category: 'editorial',
    styleTags: ['Minimal', 'Vintage'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 1, background: { type: 'color', value: '#f5f5f5' } },
      pages: [page([
        { ...baseLayer(createStableId('decorative'), 1), type: 'decorative', width: 0.7, height: 0.7, x: 0.5, y: 0.5, payload: { shape: 'circle', color: '#C9A46A', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.6, height: 0.6, x: 0.5, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
      ])],
      metadata: { title: 'Circle Frame', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_film_strip',
    name: 'Film Strip',
    type: 'look',
    description: 'Horizontal film strip with three photos',
    category: 'editorial',
    styleTags: ['Vintage', 'Archive'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 1.5, background: { type: 'color', value: '#0d0d0d' } },
      pages: [page([
        { ...baseLayer(createStableId('decorative'), 1), type: 'decorative', width: 0.96, height: 0.5, x: 0.5, y: 0.5, payload: { shape: 'square', color: '#1a1a1a', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.28, height: 0.4, x: 0.2, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 3), type: 'media', width: 0.28, height: 0.4, x: 0.5, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 4), type: 'media', width: 0.28, height: 0.4, x: 0.8, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
      ])],
      metadata: { title: 'Film Strip', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_polaroid',
    name: 'Polaroid',
    type: 'look',
    description: 'Polaroid-style frame with caption space',
    category: 'editorial',
    styleTags: ['Vintage'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 1, background: { type: 'color', value: '#2c2c2c' } },
      pages: [page([
        { ...baseLayer(createStableId('decorative'), 1), type: 'decorative', width: 0.7, height: 0.85, x: 0.5, y: 0.5, payload: { shape: 'square', color: '#ffffff', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.6, height: 0.6, x: 0.5, y: 0.4, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('text'), 3), type: 'text', width: 0.6, height: 0.06, x: 0.5, y: 0.82, payload: { text: 'Caption', textStyle: 'handwritten', textColor: '#1a1a1a', alignment: 'center', opacity: 1 } },
      ])],
      metadata: { title: 'Polaroid', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_magazine_cover',
    name: 'Magazine Cover',
    type: 'look',
    description: 'Full magazine cover with title and subtitle',
    category: 'editorial',
    styleTags: ['Archive', 'Vintage'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 0.75, background: { type: 'color', value: '#1a1a1a' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.9, height: 0.75, x: 0.5, y: 0.45, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('text'), 2), type: 'text', width: 0.85, height: 0.12, x: 0.5, y: 0.1, payload: { text: 'VOGUE', textStyle: 'poster', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
        { ...baseLayer(createStableId('text'), 3), type: 'text', width: 0.75, height: 0.06, x: 0.5, y: 0.92, payload: { text: 'The Style Issue', textStyle: 'compact', textColor: '#C9A46A', alignment: 'center', opacity: 1 } },
      ])],
      metadata: { title: 'Magazine Cover', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_collage',
    name: 'Collage',
    type: 'look',
    description: 'Free-form collage with four overlapping photos',
    category: 'editorial',
    styleTags: ['Streetwear', 'Gorpcore'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 1, background: { type: 'color', value: '#f5f5f5' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.45, height: 0.45, x: 0.3, y: 0.3, rotation: -8, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.45, height: 0.45, x: 0.7, y: 0.35, rotation: 6, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 3), type: 'media', width: 0.45, height: 0.45, x: 0.35, y: 0.7, rotation: 4, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 4), type: 'media', width: 0.45, height: 0.45, x: 0.7, y: 0.72, rotation: -5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
      ])],
      metadata: { title: 'Collage', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_split_3',
    name: 'Split 3',
    type: 'look',
    description: 'Three-way horizontal split',
    category: 'editorial',
    styleTags: ['Streetwear', 'Techwear'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 1, background: { type: 'color', value: '#0A0A0A' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.32, height: 0.96, x: 0.17, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.32, height: 0.96, x: 0.5, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 3), type: 'media', width: 0.32, height: 0.96, x: 0.83, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
      ])],
      metadata: { title: 'Split 3', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_look_feature_stack',
    name: 'Feature Stack',
    type: 'look',
    description: 'Stacked feature with one large and two small photos',
    category: 'editorial',
    styleTags: ['Minimal', 'Archive'],
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 0.8, background: { type: 'color', value: '#1a1a1a' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.85, height: 0.55, x: 0.5, y: 0.3, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.41, height: 0.3, x: 0.27, y: 0.78, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 3), type: 'media', width: 0.41, height: 0.3, x: 0.73, y: 0.78, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
      ])],
      metadata: { title: 'Feature Stack', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
];

export const POSTER_TEMPLATES: CreatorTemplate[] = [
  {
    id: 'tpl_poster_announcement',
    name: 'Announcement',
    type: 'poster',
    description: 'Photo announcement poster',
    category: 'announcement',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#1a1a1a' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.9, height: 0.6, y: 0.35, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('text'), 2), type: 'text', width: 0.8, height: 0.1, y: 0.8, payload: { text: 'New Drop', textStyle: 'headline', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
      ], 5000)],
      metadata: { title: 'Announcement', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 24, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_product_spotlight',
    name: 'Product Spotlight',
    type: 'poster',
    description: 'Spotlight a single product',
    category: 'featured',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#0d0d0d' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.85, height: 0.55, y: 0.3, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('product'), 2), type: 'product', width: 0.6, height: 0.12, y: 0.75, payload: { listingId: '', snapshotTitle: 'Featured Item', snapshotPriceGbp: 49, availability: 'active' } },
      ], 5000)],
      metadata: { title: 'Product Spotlight', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 24, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_style_vote',
    name: 'Style Vote',
    type: 'poster',
    description: 'Vote on two styles',
    category: 'interactive',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#1a1a2e' } },
      pages: [page([
        { ...baseLayer(createStableId('text'), 1), type: 'text', width: 0.8, height: 0.08, y: 0.15, payload: { text: 'Which style?', textStyle: 'headline', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
        { ...baseLayer(createStableId('vote'), 2), type: 'vote', width: 0.7, height: 0.3, y: 0.55, payload: { question: 'Pick your favourite', options: [
          { id: createStableId('opt'), label: 'Option A' },
          { id: createStableId('opt'), label: 'Option B' },
        ] } },
      ], 7000)],
      metadata: { title: 'Style Vote', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 48, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_new_listing',
    name: 'New Listing',
    type: 'poster',
    description: 'Announce a new listing',
    category: 'announcement',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#1a1a1a' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.8, height: 0.5, y: 0.3, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('text'), 2), type: 'text', width: 0.7, height: 0.08, y: 0.7, payload: { text: 'Just Listed', textStyle: 'compact', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
        { ...baseLayer(createStableId('product'), 3), type: 'product', width: 0.5, height: 0.1, y: 0.85, payload: { listingId: '', snapshotTitle: 'New Item', snapshotPriceGbp: 29, availability: 'active' } },
      ], 5000)],
      metadata: { title: 'New Listing', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 24, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_behind_scenes',
    name: 'Behind the Scenes',
    type: 'poster',
    description: 'Share a behind-the-scenes moment',
    category: 'story',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#0d0d0d' } },
      pages: [
        page([{ ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.9, height: 0.7, y: 0.4, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } }], 3000),
        page([{ ...baseLayer(createStableId('text'), 1), type: 'text', width: 0.8, height: 0.1, payload: { text: 'Behind the Scenes', textStyle: 'editorial', textColor: '#ffffff', alignment: 'center', opacity: 1 } }], 3000),
      ],
      metadata: { title: 'Behind the Scenes', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 24, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_countdown_drop',
    name: 'Countdown Drop',
    type: 'poster',
    description: 'Build hype with a countdown',
    category: 'featured',
    build: () => {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 3);
      endDate.setHours(18, 0, 0, 0);
      return {
        id: createStableId('doc'),
        type: 'poster',
        version: 1,
        canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#1a1a2e' } },
        pages: [page([
          { ...baseLayer(createStableId('text'), 1), type: 'text', width: 0.8, height: 0.1, y: 0.2, payload: { text: 'Coming Soon', textStyle: 'headline', textColor: '#C9A46A', alignment: 'center', opacity: 1 } },
          { ...baseLayer(createStableId('countdown'), 2), type: 'countdown', width: 0.5, height: 0.12, y: 0.5, payload: { label: 'Drop starts in', endDateTime: endDate.toISOString(), color: '#C9A46A', textColor: '#ffffff' } },
          { ...baseLayer(createStableId('text'), 3), type: 'text', width: 0.7, height: 0.08, y: 0.8, payload: { text: 'Don\'t miss it', textStyle: 'compact', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
        ], 7000)],
        metadata: { title: 'Countdown Drop', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 72, allowRemix: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'tpl_poster_quiz_trivia',
    name: 'Style Quiz',
    type: 'poster',
    description: 'Engage with a style quiz',
    category: 'interactive',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#1a1a1a' } },
      pages: [page([
        { ...baseLayer(createStableId('text'), 1), type: 'text', width: 0.8, height: 0.08, y: 0.15, payload: { text: 'Guess the era', textStyle: 'headline', textColor: '#C9A46A', alignment: 'center', opacity: 1 } },
        { ...baseLayer(createStableId('quiz'), 2), type: 'quiz', width: 0.75, height: 0.3, y: 0.55, payload: (() => {
          const opts = [
            { id: createStableId('opt'), label: '1960s' },
            { id: createStableId('opt'), label: '1980s' },
            { id: createStableId('opt'), label: '2000s' },
          ];
          return { question: 'When was this look popular?', options: opts, correctOptionId: opts[1].id, emoji: '🎯' };
        })() },
      ], 8000)],
      metadata: { title: 'Style Quiz', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 24, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_qa_session',
    name: 'Q&A Session',
    type: 'poster',
    description: 'Invite questions from followers',
    category: 'interactive',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#9b0202' } },
      pages: [page([
        { ...baseLayer(createStableId('text'), 1), type: 'text', width: 0.8, height: 0.1, y: 0.25, payload: { text: 'Ask Me Anything', textStyle: 'headline', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
        { ...baseLayer(createStableId('question'), 2), type: 'question', width: 0.6, height: 0.12, y: 0.6, payload: { prompt: 'What do you want to know?', placeholder: 'Type your question...', backgroundColor: '#6B3245', textColor: '#ffffff' } },
      ], 10000)],
      metadata: { title: 'Q&A Session', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 24, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_emoji_react',
    name: 'React Slider',
    type: 'poster',
    description: 'Get vibe feedback with emoji slider',
    category: 'interactive',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#0d0d0d' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.85, height: 0.5, y: 0.28, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('text'), 2), type: 'text', width: 0.7, height: 0.06, y: 0.62, payload: { text: 'How much do you love it?', textStyle: 'clean', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
        { ...baseLayer(createStableId('emojiSlider'), 3), type: 'emojiSlider', width: 0.6, height: 0.1, y: 0.8, payload: { question: 'Rate this look', emoji: '😍', endLabel: 'Obsessed', sliderColor: '#C9A46A' } },
      ], 6000)],
      metadata: { title: 'React Slider', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 24, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_flash_sale',
    name: 'Flash Sale',
    type: 'poster',
    description: 'Time-sensitive sale announcement',
    category: 'sale',
    build: () => {
      const endDate = new Date();
      endDate.setHours(endDate.getHours() + 24);
      return {
        id: createStableId('doc'),
        type: 'poster',
        version: 1,
        canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#9b0202' } },
        pages: [page([
          { ...baseLayer(createStableId('text'), 1), type: 'text', width: 0.85, height: 0.12, y: 0.2, payload: { text: 'FLASH SALE', textStyle: 'poster', textColor: '#C9A46A', alignment: 'center', opacity: 1 } },
          { ...baseLayer(createStableId('text'), 2), type: 'text', width: 0.7, height: 0.08, y: 0.38, payload: { text: '24 hours only', textStyle: 'compact', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
          { ...baseLayer(createStableId('countdown'), 3), type: 'countdown', width: 0.5, height: 0.12, y: 0.6, payload: { label: 'Sale ends in', endDateTime: endDate.toISOString(), color: '#C9A46A', textColor: '#ffffff' } },
          { ...baseLayer(createStableId('product'), 4), type: 'product', width: 0.5, height: 0.1, y: 0.85, payload: { listingId: '', snapshotTitle: 'Shop Now', snapshotPriceGbp: 0, availability: 'active' } },
        ], 8000)],
        metadata: { title: 'Flash Sale', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 24, allowRemix: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'tpl_poster_multi_page_story',
    name: 'Story Sequence',
    type: 'poster',
    description: '3-page story with text and media',
    category: 'story',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#1a1a1a' } },
      pages: [
        page([{ ...baseLayer(createStableId('text'), 1), type: 'text', width: 0.8, height: 0.15, payload: { text: 'Once upon a time...', textStyle: 'editorial', textColor: '#C9A46A', alignment: 'center', opacity: 1 } }], 3000),
        page([{ ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.9, height: 0.7, y: 0.4, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } }], 4000),
        page([
          { ...baseLayer(createStableId('text'), 1), type: 'text', width: 0.8, height: 0.1, y: 0.3, payload: { text: 'The end', textStyle: 'signature', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
          { ...baseLayer(createStableId('vote'), 2), type: 'vote', width: 0.6, height: 0.2, y: 0.65, payload: { question: 'Want more?', options: [
            { id: createStableId('opt'), label: 'Yes!' },
            { id: createStableId('opt'), label: 'No' },
          ] } },
        ], 5000),
      ],
      metadata: { title: 'Story Sequence', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 24, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  // ── Instagram parity: extended poster presets ─────────────────────
  {
    id: 'tpl_poster_poll_3',
    name: 'Poll 3',
    type: 'poster',
    description: 'Three-option poll template',
    category: 'interactive',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#1a1a2e' } },
      pages: [page([
        { ...baseLayer(createStableId('text'), 1), type: 'text', width: 0.8, height: 0.08, y: 0.15, payload: { text: 'Which one?', textStyle: 'headline', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
        { ...baseLayer(createStableId('quiz'), 2), type: 'quiz', width: 0.75, height: 0.35, y: 0.55, payload: (() => {
          const opts = [
            { id: createStableId('opt'), label: 'Option A' },
            { id: createStableId('opt'), label: 'Option B' },
            { id: createStableId('opt'), label: 'Option C' },
          ];
          return { question: 'Pick your favourite', options: opts, correctOptionId: opts[0].id, emoji: '🗳️' };
        })() },
      ], 5000)],
      metadata: { title: 'Poll 3', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 48, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_countdown_event',
    name: 'Countdown Event',
    type: 'poster',
    description: 'Event countdown with details',
    category: 'announcement',
    build: () => {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      endDate.setHours(19, 0, 0, 0);
      return {
        id: createStableId('doc'),
        type: 'poster',
        version: 1,
        canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#1a1a2e' } },
        pages: [page([
          { ...baseLayer(createStableId('text'), 1), type: 'text', width: 0.8, height: 0.1, y: 0.18, payload: { text: 'Event Night', textStyle: 'headline', textColor: '#C9A46A', alignment: 'center', opacity: 1 } },
          { ...baseLayer(createStableId('countdown'), 2), type: 'countdown', width: 0.6, height: 0.14, y: 0.5, payload: { label: 'Starts in', endDateTime: endDate.toISOString(), color: '#C9A46A', textColor: '#ffffff' } },
          { ...baseLayer(createStableId('text'), 3), type: 'text', width: 0.7, height: 0.08, y: 0.82, payload: { text: 'Save the date', textStyle: 'compact', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
        ], 7000)],
        metadata: { title: 'Countdown Event', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 168, allowRemix: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'tpl_poster_music_drop',
    name: 'Music Drop',
    type: 'poster',
    description: 'Album art with music sticker',
    category: 'featured',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#0d0d0d' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.7, height: 0.5, y: 0.3, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('music'), 2), type: 'music', width: 0.6, height: 0.12, y: 0.72, payload: { trackName: 'New Track', artistName: 'Artist', opacity: 1, volume: 1, fadeInMs: 0, fadeOutMs: 0 } },
        { ...baseLayer(createStableId('text'), 3), type: 'text', width: 0.7, height: 0.06, y: 0.88, payload: { text: 'Out now', textStyle: 'compact', textColor: '#C9A46A', alignment: 'center', opacity: 1 } },
      ], 15000)],
      metadata: { title: 'Music Drop', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 24, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_location_tag',
    name: 'Location Tag',
    type: 'poster',
    description: 'Location-focused story',
    category: 'story',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#1a1a1a' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.9, height: 0.7, y: 0.4, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('location'), 2), type: 'location', width: 0.5, height: 0.1, y: 0.82, payload: { placeName: 'London, UK', countryCode: 'GB' } },
      ], 5000)],
      metadata: { title: 'Location Tag', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 24, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_hashtag_campaign',
    name: 'Hashtag Campaign',
    type: 'poster',
    description: 'Hashtag-focused campaign story',
    category: 'announcement',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#9b0202' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.85, height: 0.5, y: 0.3, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('hashtag'), 2), type: 'hashtag', width: 0.6, height: 0.1, y: 0.68, payload: { tag: 'ThryftFinds', backgroundColor: '#C9A46A', textColor: '#ffffff' } },
        { ...baseLayer(createStableId('text'), 3), type: 'text', width: 0.7, height: 0.06, y: 0.85, payload: { text: 'Join the campaign', textStyle: 'compact', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
      ], 5000)],
      metadata: { title: 'Hashtag Campaign', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 48, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_behind_scenes_multi',
    name: 'Behind Scenes',
    type: 'poster',
    description: 'Three-page behind-the-scenes story',
    category: 'story',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#0d0d0d' } },
      pages: [
        page([
          { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.9, height: 0.6, y: 0.35, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
          { ...baseLayer(createStableId('text'), 2), type: 'text', width: 0.7, height: 0.08, y: 0.82, payload: { text: 'On set', textStyle: 'compact', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
        ], 5000),
        page([
          { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.9, height: 0.6, y: 0.35, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
          { ...baseLayer(createStableId('text'), 2), type: 'text', width: 0.7, height: 0.08, y: 0.82, payload: { text: 'Getting ready', textStyle: 'compact', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
        ], 5000),
        page([
          { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.9, height: 0.6, y: 0.35, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
          { ...baseLayer(createStableId('text'), 2), type: 'text', width: 0.7, height: 0.08, y: 0.82, payload: { text: 'The final look', textStyle: 'compact', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
        ], 5000),
      ],
      metadata: { title: 'Behind Scenes', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 24, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_tutorial_step',
    name: 'Tutorial Step',
    type: 'poster',
    description: 'Step-by-step tutorial with number',
    category: 'story',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#1a1a1a' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.85, height: 0.55, y: 0.32, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('text'), 2), type: 'text', width: 0.15, height: 0.1, x: 0.15, y: 0.15, payload: { text: '1', textStyle: 'poster', textColor: '#C9A46A', alignment: 'center', opacity: 1 } },
        { ...baseLayer(createStableId('text'), 3), type: 'text', width: 0.7, height: 0.08, y: 0.82, payload: { text: 'Step one: prep', textStyle: 'clean', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
      ], 7000)],
      metadata: { title: 'Tutorial Step', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 24, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_testimonial',
    name: 'Testimonial',
    type: 'poster',
    description: 'Customer quote template',
    category: 'featured',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#1a1a2e' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.4, height: 0.4, x: 0.5, y: 0.25, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('text'), 2), type: 'text', width: 0.8, height: 0.15, y: 0.6, payload: { text: '"Absolutely love it"', textStyle: 'editorial', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
        { ...baseLayer(createStableId('text'), 3), type: 'text', width: 0.6, height: 0.06, y: 0.82, payload: { text: '— Happy Customer', textStyle: 'signature', textColor: '#C9A46A', alignment: 'center', opacity: 1 } },
      ], 6000)],
      metadata: { title: 'Testimonial', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 48, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_before_after',
    name: 'Before After',
    type: 'poster',
    description: 'Two-page comparison template',
    category: 'story',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#0d0d0d' } },
      pages: [
        page([
          { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.85, height: 0.6, y: 0.35, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
          { ...baseLayer(createStableId('text'), 2), type: 'text', width: 0.6, height: 0.08, y: 0.82, payload: { text: 'Before', textStyle: 'headline', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
        ], 5000),
        page([
          { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.85, height: 0.6, y: 0.35, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
          { ...baseLayer(createStableId('text'), 2), type: 'text', width: 0.6, height: 0.08, y: 0.82, payload: { text: 'After', textStyle: 'headline', textColor: '#C9A46A', alignment: 'center', opacity: 1 } },
        ], 5000),
      ],
      metadata: { title: 'Before After', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 24, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_product_reveal',
    name: 'Product Reveal',
    type: 'poster',
    description: 'Three-page teaser reveal sequence',
    category: 'announcement',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#1a1a1a' } },
      pages: [
        page([
          { ...baseLayer(createStableId('text'), 1), type: 'text', width: 0.8, height: 0.12, payload: { text: 'Something is coming...', textStyle: 'headline', textColor: '#C9A46A', alignment: 'center', opacity: 1 } },
        ], 5000),
        page([
          { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.85, height: 0.65, y: 0.4, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
          { ...baseLayer(createStableId('text'), 2), type: 'text', width: 0.7, height: 0.08, y: 0.85, payload: { text: 'Here it is', textStyle: 'headline', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
        ], 5000),
        page([
          { ...baseLayer(createStableId('product'), 1), type: 'product', width: 0.6, height: 0.15, y: 0.4, payload: { listingId: '', snapshotTitle: 'New Arrival', snapshotPriceGbp: 39, availability: 'active' } },
          { ...baseLayer(createStableId('text'), 2), type: 'text', width: 0.7, height: 0.08, y: 0.7, payload: { text: 'Shop now', textStyle: 'compact', textColor: '#C9A46A', alignment: 'center', opacity: 1 } },
        ], 5000),
      ],
      metadata: { title: 'Product Reveal', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 48, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_flash_sale_countdown',
    name: 'Flash Sale Countdown',
    type: 'poster',
    description: 'Flash sale with live countdown',
    category: 'sale',
    build: () => {
      const endDate = new Date();
      endDate.setHours(endDate.getHours() + 12);
      return {
        id: createStableId('doc'),
        type: 'poster',
        version: 1,
        canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#9b0202' } },
        pages: [page([
          { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.85, height: 0.45, y: 0.25, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
          { ...baseLayer(createStableId('text'), 2), type: 'text', width: 0.85, height: 0.1, y: 0.55, payload: { text: 'FLASH SALE', textStyle: 'poster', textColor: '#C9A46A', alignment: 'center', opacity: 1 } },
          { ...baseLayer(createStableId('countdown'), 3), type: 'countdown', width: 0.55, height: 0.12, y: 0.78, payload: { label: 'Ends in', endDateTime: endDate.toISOString(), color: '#C9A46A', textColor: '#ffffff' } },
        ], 10000)],
        metadata: { title: 'Flash Sale Countdown', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 24, allowRemix: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'tpl_poster_qa_round',
    name: 'Q&A Round',
    type: 'poster',
    description: 'Q&A session with question sticker',
    category: 'interactive',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.5625, background: { type: 'color', value: '#1a1a2e' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.85, height: 0.45, y: 0.25, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('text'), 2), type: 'text', width: 0.8, height: 0.08, y: 0.58, payload: { text: 'Ask me anything', textStyle: 'headline', textColor: '#C9A46A', alignment: 'center', opacity: 1 } },
        { ...baseLayer(createStableId('question'), 3), type: 'question', width: 0.6, height: 0.12, y: 0.8, payload: { prompt: 'What do you want to know?', placeholder: 'Type your question...', backgroundColor: '#6B3245', textColor: '#ffffff' } },
      ], 7000)],
      metadata: { title: 'Q&A Round', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 24, allowRemix: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  // ── Moodboard templates ──
  // Editorial collage-style posters for arranging multiple items into a
  // themed moodboard. These are part of the poster creative tooling —
  // users access them via the poster template browser's "Moodboard"
  // category. Each template provides a different collage layout.
  {
    id: 'tpl_poster_moodboard_grid',
    name: 'Moodboard Grid',
    type: 'poster',
    description: '2×2 editorial collage grid',
    category: 'moodboard',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 1, background: { type: 'color', value: '#f7f5f2' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.42, height: 0.42, x: 0.28, y: 0.28, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.42, height: 0.42, x: 0.72, y: 0.28, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 3), type: 'media', width: 0.42, height: 0.42, x: 0.28, y: 0.72, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 4), type: 'media', width: 0.42, height: 0.42, x: 0.72, y: 0.72, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
      ], 0)],
      metadata: { title: 'Moodboard Grid', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 48, allowRemix: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_moodboard_editorial',
    name: 'Editorial Collage',
    type: 'poster',
    description: 'Asymmetric editorial collage with text',
    category: 'moodboard',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.8, background: { type: 'color', value: '#1a1a1a' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.55, height: 0.6, x: 0.35, y: 0.3, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.3, height: 0.3, x: 0.78, y: 0.68, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 0.9 } },
        { ...baseLayer(createStableId('text'), 3), type: 'text', width: 0.5, height: 0.06, x: 0.3, y: 0.78, payload: { text: 'Season Edit', textStyle: 'headline', textColor: '#C9A46A', alignment: 'left', opacity: 1 } },
      ], 0)],
      metadata: { title: 'Editorial Collage', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 48, allowRemix: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_moodboard_collection',
    name: 'Collection Board',
    type: 'poster',
    description: 'Six-item collection moodboard',
    category: 'moodboard',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 1.2, background: { type: 'color', value: '#f0ede8' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.28, height: 0.28, x: 0.2, y: 0.22, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.28, height: 0.28, x: 0.5, y: 0.22, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 3), type: 'media', width: 0.28, height: 0.28, x: 0.8, y: 0.22, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 4), type: 'media', width: 0.28, height: 0.28, x: 0.2, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 5), type: 'media', width: 0.28, height: 0.28, x: 0.5, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 6), type: 'media', width: 0.28, height: 0.28, x: 0.8, y: 0.5, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('text'), 7), type: 'text', width: 0.6, height: 0.05, x: 0.5, y: 0.82, payload: { text: 'Curated Collection', textStyle: 'compact', textColor: '#666666', alignment: 'center', opacity: 1 } },
      ], 0)],
      metadata: { title: 'Collection Board', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 48, allowRemix: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'tpl_poster_moodboard_inspiration',
    name: 'Inspiration Wall',
    type: 'poster',
    description: 'Scattered inspiration wall collage',
    category: 'moodboard',
    build: () => ({
      id: createStableId('doc'),
      type: 'poster',
      version: 1,
      canvas: { aspectRatio: 0.75, background: { type: 'color', value: '#2a2a2a' } },
      pages: [page([
        { ...baseLayer(createStableId('media'), 1), type: 'media', width: 0.4, height: 0.5, x: 0.3, y: 0.28, rotation: -0.05, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 1 } },
        { ...baseLayer(createStableId('media'), 2), type: 'media', width: 0.32, height: 0.4, x: 0.7, y: 0.32, rotation: 0.08, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 0.95 } },
        { ...baseLayer(createStableId('media'), 3), type: 'media', width: 0.28, height: 0.28, x: 0.28, y: 0.72, rotation: 0.04, payload: { mediaUri: '', mediaType: 'image', contentFit: 'cover', opacity: 0.9 } },
        { ...baseLayer(createStableId('text'), 4), type: 'text', width: 0.4, height: 0.05, x: 0.7, y: 0.78, payload: { text: 'Mood Board', textStyle: 'clean', textColor: '#C9A46A', alignment: 'right', opacity: 1 } },
      ], 0)],
      metadata: { title: 'Inspiration Wall', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, expiresInHours: 48, allowRemix: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
];

export const ALL_TEMPLATES: CreatorTemplate[] = [...LOOK_TEMPLATES, ...POSTER_TEMPLATES];

export function getTemplateById(id: string): CreatorTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByType(type: 'look' | 'poster'): CreatorTemplate[] {
  return type === 'look' ? LOOK_TEMPLATES : POSTER_TEMPLATES;
}

export type TemplateCategory = CreatorTemplate['category'];

export const TEMPLATE_CATEGORIES: Array<{ key: TemplateCategory | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'featured', label: 'Featured' },
  { key: 'announcement', label: 'Announce' },
  { key: 'interactive', label: 'Interactive' },
  { key: 'story', label: 'Story' },
  { key: 'sale', label: 'Sale' },
  { key: 'editorial', label: 'Editorial' },
  { key: 'moodboard', label: 'Moodboard' },
];

export function getTemplatesByCategory(type: 'look' | 'poster', category: TemplateCategory | 'all'): CreatorTemplate[] {
  const all = getTemplatesByType(type);
  if (category === 'all') return all;
  return all.filter((t) => t.category === category);
}
