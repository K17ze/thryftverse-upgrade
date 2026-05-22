import { MOCK_LISTINGS, MOCK_USERS, User } from './mockData';
import { ENABLE_RUNTIME_MOCKS } from '../constants/runtimeFlags';

export interface PosterStoryOverlay {
  text: string;
  color: string;
  position: 'top' | 'center' | 'bottom';
  fontFamily?: string;
  fontSize?: number;
  backgroundColor?: string;
  alignment?: 'left' | 'center' | 'right';
}

export interface PosterSticker {
  id: string;
  type: 'mention' | 'hashtag' | 'poll' | 'question' | 'emoji' | 'shape' | 'countdown';
  content: string;
  color?: string;
  x?: number;
  y?: number;
  targetDate?: string;
  listingId?: string;
  options?: string[];
  votes?: number[];
}

export interface PosterDrawingStroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

export interface PosterTemplateLayer {
  text: string;
  color: string;
  fontFamily?: string;
  fontSize?: number;
  backgroundColor?: string;
  alignment?: 'left' | 'center' | 'right';
  x: number;
  y: number;
}

export interface PosterTemplateSticker {
  type: PosterSticker['type'];
  content: string;
  color?: string;
  x: number;
  y: number;
}

export interface PosterTemplate {
  id: string;
  name: string;
  category: 'drop' | 'auction' | 'coown' | 'sale' | 'general';
  layout: 'single' | 'split-h' | 'split-v' | 'triple-h' | 'grid-2x2' | 'photo-booth';
  backgroundColor?: string;
  filter?: string;
  textLayers?: PosterTemplateLayer[];
  stickers?: PosterTemplateSticker[];
  thumbnailColor: string;
  icon: string;
}

export interface Poster {
  id: string;
  uploaderId: string;
  listingId: string;
  image: string;
  caption: string;
  createdAt: string;
  expiryHours: number;
  sharedFromUserId?: string;
  storyOverlay?: PosterStoryOverlay;
  textLayers?: PosterStoryOverlay[];
  stickers?: PosterSticker[];
  drawings?: PosterDrawingStroke[];
  layout?: string;
  filter?: string;
  templateId?: string;
}

export interface PosterViewModel extends Poster {
  createdAtMs: number;
  expiresAtMs: number;
  remainingHours: number;
  uploader?: User;
  sharedFrom?: User;
}

export const POSTER_TEMPLATES: PosterTemplate[] = [
  {
    id: 'tpl_fresh_drop', name: 'Fresh Drop', category: 'drop', layout: 'single',
    backgroundColor: '#1a1a2e', filter: 'clarendon',
    textLayers: [
      { text: 'FRESH DROP', color: '#ffffff', fontFamily: 'bold', fontSize: 32, x: 40, y: 120 },
      { text: 'Just listed', color: '#ffcc00', fontFamily: 'modern', fontSize: 18, x: 40, y: 170 },
    ],
    stickers: [{ type: 'emoji', content: '🔥', x: 280, y: 120 }],
    thumbnailColor: '#1a1a2e', icon: 'flame',
  },
  {
    id: 'tpl_auction_live', name: 'Auction Live', category: 'auction', layout: 'single',
    backgroundColor: '#0f3460', filter: 'juno',
    textLayers: [
      { text: 'LIVE AUCTION', color: '#ff3b30', fontFamily: 'bold', fontSize: 28, x: 30, y: 100 },
      { text: 'Bid now!', color: '#ffffff', fontFamily: 'classic', fontSize: 18, x: 30, y: 150 },
    ],
    stickers: [
      { type: 'countdown', content: 'Ends in 2h', color: '#ff3b30', x: 30, y: 200 },
      { type: 'emoji', content: '🔨', x: 300, y: 100 },
    ],
    thumbnailColor: '#0f3460', icon: 'hammer',
  },
  {
    id: 'tpl_coown_open', name: 'Co-Own Open', category: 'coown', layout: 'single',
    backgroundColor: '#16213e', filter: 'ludwig',
    textLayers: [
      { text: 'CO-OWN', color: '#4cd964', fontFamily: 'bold', fontSize: 30, x: 40, y: 110 },
      { text: 'Split the cost', color: '#ffffff', fontFamily: 'modern', fontSize: 16, x: 40, y: 160 },
    ],
    stickers: [{ type: 'emoji', content: '🤝', x: 290, y: 110 }],
    thumbnailColor: '#16213e', icon: 'people',
  },
  {
    id: 'tpl_price_drop', name: 'Price Drop', category: 'sale', layout: 'single',
    backgroundColor: '#e94560', filter: 'clarendon',
    textLayers: [
      { text: 'PRICE DROP', color: '#ffffff', fontFamily: 'bold', fontSize: 32, x: 30, y: 120, backgroundColor: 'rgba(0,0,0,0.3)' },
      { text: 'Was £120  →  Now £80', color: '#ffcc00', fontFamily: 'classic', fontSize: 20, x: 30, y: 180 },
    ],
    stickers: [{ type: 'emoji', content: '📉', x: 300, y: 120 }],
    thumbnailColor: '#e94560', icon: 'trending-down',
  },
  {
    id: 'tpl_new_tags', name: 'New With Tags', category: 'drop', layout: 'single',
    backgroundColor: '#1dd1a1', filter: 'perpetua',
    textLayers: [
      { text: 'NEW WITH TAGS', color: '#ffffff', fontFamily: 'bold', fontSize: 26, x: 30, y: 120 },
      { text: 'Never worn', color: '#16213e', fontFamily: 'modern', fontSize: 16, x: 30, y: 170 },
    ],
    stickers: [{ type: 'emoji', content: '🏷️', x: 300, y: 120 }],
    thumbnailColor: '#1dd1a1', icon: 'pricetag',
  },
  {
    id: 'tpl_vintage', name: 'Vintage Find', category: 'general', layout: 'single',
    backgroundColor: '#d4a76a', filter: 'reyes',
    textLayers: [
      { text: 'VINTAGE', color: '#3d2b1f', fontFamily: 'typewriter', fontSize: 32, x: 40, y: 120 },
      { text: 'One of a kind', color: '#5a3e2b', fontFamily: 'typewriter', fontSize: 16, x: 40, y: 170 },
    ],
    stickers: [{ type: 'emoji', content: '🕰️', x: 300, y: 120 }],
    thumbnailColor: '#d4a76a', icon: 'time',
  },
  {
    id: 'tpl_flash_sale', name: 'Flash Sale', category: 'sale', layout: 'single',
    backgroundColor: '#ff6b6b', filter: 'clarendon',
    textLayers: [
      { text: 'FLASH SALE', color: '#ffffff', fontFamily: 'bold', fontSize: 32, x: 30, y: 100 },
      { text: '24 hours only', color: '#ffffff', fontFamily: 'modern', fontSize: 18, x: 30, y: 155 },
    ],
    stickers: [
      { type: 'countdown', content: '23:59:59', color: '#ffffff', x: 30, y: 200 },
      { type: 'emoji', content: '⚡', x: 300, y: 100 },
    ],
    thumbnailColor: '#ff6b6b', icon: 'flash',
  },
  {
    id: 'tpl_mystery', name: 'Mystery Box', category: 'general', layout: 'single',
    backgroundColor: '#5f27cd', filter: 'slumber',
    textLayers: [
      { text: 'MYSTERY BOX', color: '#ffffff', fontFamily: 'bold', fontSize: 28, x: 30, y: 120 },
      { text: 'Worth £200+ inside', color: '#ffcc00', fontFamily: 'modern', fontSize: 16, x: 30, y: 170 },
    ],
    stickers: [{ type: 'emoji', content: '🎁', x: 300, y: 120 }],
    thumbnailColor: '#5f27cd', icon: 'gift',
  },
  {
    id: 'tpl_quick_sell', name: 'Quick Sell', category: 'sale', layout: 'split-h',
    backgroundColor: '#ff9500', filter: 'juno',
    textLayers: [
      { text: 'QUICK SELL', color: '#ffffff', fontFamily: 'bold', fontSize: 28, x: 30, y: 80 },
    ],
    stickers: [{ type: 'emoji', content: '💨', x: 280, y: 80 }],
    thumbnailColor: '#ff9500', icon: 'speedometer',
  },
  {
    id: 'tpl_bundle', name: 'Bundle Deal', category: 'sale', layout: 'grid-2x2',
    backgroundColor: '#48dbfb', filter: 'lark',
    textLayers: [
      { text: 'BUNDLE', color: '#ffffff', fontFamily: 'bold', fontSize: 28, x: 30, y: 80 },
      { text: '3 for £50', color: '#0f3460', fontFamily: 'classic', fontSize: 18, x: 30, y: 130 },
    ],
    stickers: [{ type: 'emoji', content: '📦', x: 280, y: 80 }],
    thumbnailColor: '#48dbfb', icon: 'cube',
  },
  {
    id: 'tpl_rare', name: 'Rare Find', category: 'general', layout: 'single',
    backgroundColor: '#222f3e', filter: 'moon',
    textLayers: [
      { text: 'RARE', color: '#ffcc00', fontFamily: 'bold', fontSize: 36, x: 40, y: 120 },
      { text: 'Limited edition', color: '#c8d6e5', fontFamily: 'modern', fontSize: 16, x: 40, y: 180 },
    ],
    stickers: [{ type: 'emoji', content: '💎', x: 290, y: 120 }],
    thumbnailColor: '#222f3e', icon: 'diamond',
  },
  {
    id: 'tpl_swap', name: 'Swap Request', category: 'general', layout: 'single',
    backgroundColor: '#54a0ff', filter: 'aden',
    textLayers: [
      { text: 'SWAP?', color: '#ffffff', fontFamily: 'bold', fontSize: 36, x: 40, y: 120 },
      { text: 'Open to trades', color: '#ffffff', fontFamily: 'modern', fontSize: 16, x: 40, y: 180 },
    ],
    stickers: [{ type: 'emoji', content: '🔄', x: 280, y: 120 }],
    thumbnailColor: '#54a0ff', icon: 'repeat',
  },
];

const NOW_TS = Date.now();

export const MOCK_POSTERS: Poster[] = [
  {
    id: 'p1',
    uploaderId: 'u1',
    listingId: 'l1',
    image: MOCK_LISTINGS[0]?.images[0] ?? 'https://picsum.photos/seed/poster1/400/500',
    caption: 'Fresh drop: YSL knit in very good condition',
    createdAt: new Date(NOW_TS - 20 * 60 * 1000).toISOString(),
    expiryHours: 24,
    templateId: 'tpl_fresh_drop',
  },
  {
    id: 'p2',
    uploaderId: 'u2',
    listingId: 'l5',
    image: MOCK_LISTINGS[4]?.images[0] ?? 'https://picsum.photos/seed/poster2/400/500',
    caption: 'Off-White hoodie deal, size XL',
    createdAt: new Date(NOW_TS - 55 * 60 * 1000).toISOString(),
    expiryHours: 18,
  },
  {
    id: 'p3',
    uploaderId: 'u1',
    listingId: 'l6',
    image: MOCK_LISTINGS[5]?.images[0] ?? 'https://picsum.photos/seed/poster3/400/500',
    caption: 'Sharing this sneaker ad from my friend',
    createdAt: new Date(NOW_TS - 95 * 60 * 1000).toISOString(),
    expiryHours: 12,
    sharedFromUserId: 'u3',
  },
  {
    id: 'p4',
    uploaderId: 'u4',
    listingId: 'l7',
    image: MOCK_LISTINGS[6]?.images[0] ?? 'https://picsum.photos/seed/poster4/400/500',
    caption: 'New with tags cargo trousers',
    createdAt: new Date(NOW_TS - 3.5 * 60 * 60 * 1000).toISOString(),
    expiryHours: 10,
    templateId: 'tpl_new_tags',
  },
  {
    id: 'p_expired',
    uploaderId: 'u3',
    listingId: 'l3',
    image: MOCK_LISTINGS[2]?.images[0] ?? 'https://picsum.photos/seed/poster5/400/500',
    caption: 'This one is expired and should be hidden',
    createdAt: new Date(NOW_TS - 30 * 60 * 60 * 1000).toISOString(),
    expiryHours: 24,
  },
];

export function getFreshPosters(
  now = Date.now(),
  freshnessHours = 24,
  runtimePosters: Poster[] = []
): PosterViewModel[] {
  const freshnessWindowMs = freshnessHours * 60 * 60 * 1000;
  const seedPosters = ENABLE_RUNTIME_MOCKS ? MOCK_POSTERS : [];

  return [...runtimePosters, ...seedPosters]
    .map((poster) => {
      const createdAtMs = new Date(poster.createdAt).getTime();
      const expiresAtMs = createdAtMs + poster.expiryHours * 60 * 60 * 1000;
      const uploader = MOCK_USERS.find((user) => user.id === poster.uploaderId);
      const sharedFrom = poster.sharedFromUserId
        ? MOCK_USERS.find((user) => user.id === poster.sharedFromUserId)
        : undefined;
      const remainingHours = Math.max(1, Math.ceil((expiresAtMs - now) / (60 * 60 * 1000)));

      return {
        ...poster,
        createdAtMs,
        expiresAtMs,
        remainingHours,
        uploader,
        sharedFrom,
      };
    })
    .filter((poster) => poster.expiresAtMs > now && now - poster.createdAtMs <= freshnessWindowMs)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}
