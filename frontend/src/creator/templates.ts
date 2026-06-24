import { createStableId } from '../utils/createStableId';
import type { CreatorDocument, CreatorLayer, CreatorPage } from './composition';

export interface CreatorTemplate {
  id: string;
  name: string;
  type: 'look' | 'poster';
  description: string;
  build: () => CreatorDocument;
}

function page(layers: CreatorLayer[], durationMs?: number): CreatorPage {
  return { id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, layers, durationMs };
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
    build: () => ({
      id: createStableId('doc'),
      type: 'look',
      version: 1,
      canvas: { aspectRatio: 1, background: { type: 'color', value: '#2c2c2c' } },
      pages: [page([
        { ...baseLayer(createStableId('decorative'), 1), type: 'decorative', width: 0.5, height: 0.5, x: 0.3, y: 0.3, payload: { shape: 'circle', color: '#ff6b6b', opacity: 0.8 } },
        { ...baseLayer(createStableId('decorative'), 2), type: 'decorative', width: 0.4, height: 0.4, x: 0.7, y: 0.7, payload: { shape: 'circle', color: '#4cd964', opacity: 0.6 } },
        { ...baseLayer(createStableId('text'), 3), type: 'text', width: 0.6, height: 0.08, y: 0.9, payload: { text: 'Colour Story', textStyle: 'editorial', textColor: '#ffffff', alignment: 'center', opacity: 1 } },
      ])],
      metadata: { title: 'Colour Story', caption: '', visibility: 'public', allowReplies: true, allowReactions: true, allowRemix: false },
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
];

export const ALL_TEMPLATES: CreatorTemplate[] = [...LOOK_TEMPLATES, ...POSTER_TEMPLATES];

export function getTemplateById(id: string): CreatorTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByType(type: 'look' | 'poster'): CreatorTemplate[] {
  return type === 'look' ? LOOK_TEMPLATES : POSTER_TEMPLATES;
}
