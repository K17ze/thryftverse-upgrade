/**
 * Moodboard API — user-generated editorial composition layer
 *
 * This service provides the data contract and mock implementation for the
 * ThryftVerse Moodboard — a Depop "Outfits" / Pinterest board equivalent that
 * lets users create and share their own editorial collages from marketplace
 * listings. It is the user-generated companion to the Galleria (the editorial
 * discovery surface).
 *
 * Per AGENTS.md §11 (Truthful UI): the mock data is flagged via
 * `MOODBOARD_DEMO_MODE` and every entity carries `isDemo: true` so the UI can
 * show an honest "Demo mode" indicator. In demo mode, moodboards are stored
 * locally only — we never fabricate that a moodboard is shared, synced, or
 * backed by a real backend.
 *
 * The service is mock-ready — the function signatures mirror what a real
 * moodboard / collage API would expose. When a real backend is wired, set
 * `MOODBOARD_DEMO_MODE = false` and replace the mock branches with real fetch
 * calls. The UI layer does not need to change.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Position + transform of an item on the moodboard canvas. */
export interface MoodboardItemPosition {
  /** Normalised x position (0–1 relative to canvas width). */
  x: number;
  /** Normalised y position (0–1 relative to canvas height). */
  y: number;
  /** Scale factor (1 = original size). */
  scale: number;
  /** Rotation in degrees (0–360). */
  rotation: number;
}

/** A single listing placed on a moodboard canvas. */
export interface MoodboardItem {
  id: string;
  /** The source listing ID (for navigation back to the listing). */
  listingId: string;
  /** Image URI for the item on the canvas. */
  imageUri: string;
  /** Display title (listing title at time of addition). */
  title: string;
  /** Price in GBP at time of addition. */
  price: number;
  /** Position and transform on the canvas. */
  position: MoodboardItemPosition;
  /** ISO timestamp of when the item was added. */
  addedAt: string;
  /** Honest flag — true while this item comes from mock data. */
  isDemo: boolean;
}

/** A visual theme for the moodboard canvas background. */
export interface MoodboardTheme {
  id: string;
  /** Human-readable label (e.g. "Linen", "Noir", "Sage"). */
  label: string;
  /** Canvas background color. */
  backgroundColor: string;
  /** Accent color for UI chrome on the canvas. */
  accentColor: string;
  /** Font / text color on the canvas. */
  fontColor: string;
  /** Honest flag — true while this theme comes from mock data. */
  isDemo: boolean;
}

/** A user-created moodboard — a collage of listings on a themed canvas. */
export interface Moodboard {
  id: string;
  title: string;
  description: string;
  /** Curator (user) display name. */
  curator: string;
  /** Curator avatar URL. */
  curatorAvatar: string;
  /** Items placed on the canvas. */
  items: MoodboardItem[];
  /** Cover image URI (composed preview or first item image). */
  coverImage: string;
  /** Whether the moodboard is publicly discoverable. */
  isPublic: boolean;
  /** Theme ID for the canvas background. */
  theme: string;
  /** ISO timestamp of creation. */
  createdAt: string;
  /** ISO timestamp of last update. */
  updatedAt: string;
  /** Honest flag — true while this moodboard comes from mock data. */
  isDemo: boolean;
}

// ---------------------------------------------------------------------------
// Demo flag — the UI reads this to decide whether to show a "Demo mode" badge.
// When a real backend is wired, set this to false (or remove the mock branch).
// ---------------------------------------------------------------------------

export const MOODBOARD_DEMO_MODE = true;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
// Images use Unsplash source URLs (the same pattern as galleriaApi and
// marketApi mock assets). Curator avatars use UI-avatars.com so they render
// without a backend.

const NOW = Date.now();
const isoDaysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
const isoHoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

const MOCK_THEMES: MoodboardTheme[] = [
  {
    id: 'theme-linen',
    label: 'Linen',
    backgroundColor: '#F7F4EE',
    accentColor: '#8A6A3F',
    fontColor: '#2A2A2A',
    isDemo: true,
  },
  {
    id: 'theme-noir',
    label: 'Noir',
    backgroundColor: '#1A1A1A',
    accentColor: '#C9A46A',
    fontColor: '#F4F0E8',
    isDemo: true,
  },
  {
    id: 'theme-sage',
    label: 'Sage',
    backgroundColor: '#E8EDE6',
    accentColor: '#4A6741',
    fontColor: '#2A3A28',
    isDemo: true,
  },
  {
    id: 'theme-blush',
    label: 'Blush',
    backgroundColor: '#F5E6E4',
    accentColor: '#9A6B7A',
    fontColor: '#4A2A30',
    isDemo: true,
  },
  {
    id: 'theme-stone',
    label: 'Stone',
    backgroundColor: '#E5E2DC',
    accentColor: '#6B6B6B',
    fontColor: '#333333',
    isDemo: true,
  },
  {
    id: 'theme-midnight',
    label: 'Midnight',
    backgroundColor: '#0F1A2E',
    accentColor: '#4A7AC4',
    fontColor: '#E8EDF5',
    isDemo: true,
  },
];

// Helper to create positioned items with varied layout
function item(
  id: string,
  listingId: string,
  imageUri: string,
  title: string,
  price: number,
  x: number,
  y: number,
  scale: number,
  rotation: number,
  hoursAgo: number,
): MoodboardItem {
  return {
    id,
    listingId,
    imageUri,
    title,
    price,
    position: { x, y, scale, rotation },
    addedAt: isoHoursAgo(hoursAgo),
    isDemo: true,
  };
}

const MOCK_MOODBOARDS: Moodboard[] = [
  {
    id: 'mb-1',
    title: 'Autumn Layering',
    description: 'Textures for the transition season — wool, leather, and warm tones.',
    curator: 'Maya Patel',
    curatorAvatar: 'https://ui-avatars.com/api/?name=MP&background=8A6A3F&color=fff&size=128',
    coverImage: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800',
    isPublic: true,
    theme: 'theme-linen',
    createdAt: isoDaysAgo(3),
    updatedAt: isoHoursAgo(12),
    isDemo: true,
    items: [
      item('mb-1-it-1', 'listing-101', 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600', 'Wool Overcoat', 185, 0.3, 0.35, 1.0, -8, 72),
      item('mb-1-it-2', 'listing-102', 'https://images.unsplash.com/photo-1551232864-3f0890e580d9?w=600', 'Leather Boots', 220, 0.65, 0.55, 0.85, 12, 60),
      item('mb-1-it-3', 'listing-103', 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=600', 'Cashmere Scarf', 95, 0.5, 0.7, 0.9, -5, 48),
      item('mb-1-it-4', 'listing-104', 'https://images.unsplash.com/photo-1520975954732-35dd22299614?w=600', 'Selvedge Denim', 140, 0.25, 0.65, 0.8, 20, 36),
      item('mb-1-it-5', 'listing-105', 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=600', 'Knit Sweater', 110, 0.72, 0.3, 0.95, -15, 24),
      item('mb-1-it-6', 'listing-106', 'https://images.unsplash.com/photo-1547949003-9792a18a2601?w=600', 'Leather Bag', 165, 0.45, 0.45, 0.75, 8, 12),
    ],
  },
  {
    id: 'mb-2',
    title: 'Minimalist Workspace',
    description: 'Clean surfaces, considered objects, and the tools of a focused practice.',
    curator: 'James Okonkwo',
    curatorAvatar: 'https://ui-avatars.com/api/?name=JO&background=06489A&color=fff&size=128',
    coverImage: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800',
    isPublic: true,
    theme: 'theme-stone',
    createdAt: isoDaysAgo(7),
    updatedAt: isoDaysAgo(1),
    isDemo: true,
    items: [
      item('mb-2-it-1', 'listing-201', 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600', 'Oak Desk', 450, 0.5, 0.5, 1.1, 0, 168),
      item('mb-2-it-2', 'listing-202', 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600', 'Desk Lamp', 85, 0.3, 0.3, 0.9, -10, 156),
      item('mb-2-it-3', 'listing-203', 'https://images.unsplash.com/photo-1567096535036-5497076b854f?w=600', 'Ceramic Vase', 65, 0.7, 0.35, 0.85, 15, 144),
      item('mb-2-it-4', 'listing-204', 'https://images.unsplash.com/photo-1547949003-9792a18a2601?w=600', 'Leather Portfolio', 120, 0.25, 0.7, 0.8, -20, 132),
      item('mb-2-it-5', 'listing-205', 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=600', 'Studio Bowl', 75, 0.68, 0.68, 0.95, 5, 120),
      item('mb-2-it-6', 'listing-206', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600', 'Field Watch', 320, 0.5, 0.78, 0.7, -12, 108),
      item('mb-2-it-7', 'listing-207', 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600', 'Lounge Chair', 680, 0.75, 0.6, 0.9, 18, 96),
    ],
  },
  {
    id: 'mb-3',
    title: 'Evening Rituals',
    description: 'The objects that mark the end of a day — silk, scent, and low light.',
    curator: 'Sofia Lindqvist',
    curatorAvatar: 'https://ui-avatars.com/api/?name=SL&background=7B0E1E&color=fff&size=128',
    coverImage: 'https://images.unsplash.com/photo-1567427013949-0fb03cffa5f9?w=800',
    isPublic: true,
    theme: 'theme-noir',
    createdAt: isoDaysAgo(10),
    updatedAt: isoDaysAgo(2),
    isDemo: true,
    items: [
      item('mb-3-it-1', 'listing-301', 'https://images.unsplash.com/photo-1567427013949-0fb03cffa5f9?w=600', 'Silk Robe', 240, 0.4, 0.4, 1.0, -6, 240),
      item('mb-3-it-2', 'listing-302', 'https://images.unsplash.com/photo-1591348278863-a8fb3887e2aa?w=600', 'Crystal Decanter', 180, 0.65, 0.35, 0.9, 10, 228),
      item('mb-3-it-3', 'listing-303', 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600', 'Gold Watch', 420, 0.3, 0.65, 0.8, -15, 216),
      item('mb-3-it-4', 'listing-304', 'https://images.unsplash.com/photo-1578500494198-246f628d5622?w=600', 'Silver Tray', 95, 0.7, 0.6, 0.85, 8, 204),
      item('mb-3-it-5', 'listing-305', 'https://images.unsplash.com/photo-1622560490174-8f949e6e2f1b?w=600', 'Leather Slippers', 130, 0.55, 0.72, 0.75, -10, 192),
    ],
  },
  {
    id: 'mb-4',
    title: 'Garden Party',
    description: 'A summer composition — linen, florals, and the ease of long afternoons.',
    curator: 'Eleanor Vance',
    curatorAvatar: 'https://ui-avatars.com/api/?name=EV&background=1C5631&color=fff&size=128',
    coverImage: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=800',
    isPublic: true,
    theme: 'theme-sage',
    createdAt: isoDaysAgo(14),
    updatedAt: isoDaysAgo(5),
    isDemo: true,
    items: [
      item('mb-4-it-1', 'listing-401', 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=600', 'Linen Dress', 160, 0.35, 0.4, 1.05, -7, 336),
      item('mb-4-it-2', 'listing-402', 'https://images.unsplash.com/photo-1551232864-3f0890e580d9?w=600', 'Straw Sandals', 85, 0.65, 0.55, 0.85, 12, 324),
      item('mb-4-it-3', 'listing-403', 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=600', 'Cotton Cardigan', 120, 0.7, 0.3, 0.9, -14, 312),
      item('mb-4-it-4', 'listing-404', 'https://images.unsplash.com/photo-1547949003-9792a18a2601?w=600', 'Woven Tote', 145, 0.28, 0.68, 0.8, 18, 300),
      item('mb-4-it-5', 'listing-405', 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=600', 'Terracotta Pot', 55, 0.5, 0.72, 0.75, -8, 288),
      item('mb-4-it-6', 'listing-406', 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600', 'Garden Chair', 320, 0.72, 0.65, 0.95, 6, 276),
      item('mb-4-it-7', 'listing-407', 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600', 'Sun Hat', 70, 0.45, 0.32, 0.7, -20, 264),
      item('mb-4-it-8', 'listing-408', 'https://images.unsplash.com/photo-1520975954732-35dd22299614?w=600', 'Relaxed Trousers', 105, 0.6, 0.7, 0.85, 10, 252),
    ],
  },
];

// Items available to add to a moodboard (from saved items / recently viewed)
const MOCK_PICKER_ITEMS: MoodboardItem[] = [
  item('picker-1', 'listing-501', 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600', 'Wool Overcoat', 185, 0.5, 0.5, 1, 0, 1),
  item('picker-2', 'listing-502', 'https://images.unsplash.com/photo-1551232864-3f0890e580d9?w=600', 'Leather Boots', 220, 0.5, 0.5, 1, 0, 1),
  item('picker-3', 'listing-503', 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=600', 'Cashmere Scarf', 95, 0.5, 0.5, 1, 0, 1),
  item('picker-4', 'listing-504', 'https://images.unsplash.com/photo-1520975954732-35dd22299614?w=600', 'Selvedge Denim', 140, 0.5, 0.5, 1, 0, 1),
  item('picker-5', 'listing-505', 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=600', 'Knit Sweater', 110, 0.5, 0.5, 1, 0, 1),
  item('picker-6', 'listing-506', 'https://images.unsplash.com/photo-1547949003-9792a18a2601?w=600', 'Leather Bag', 165, 0.5, 0.5, 1, 0, 1),
  item('picker-7', 'listing-507', 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600', 'Oak Desk', 450, 0.5, 0.5, 1, 0, 1),
  item('picker-8', 'listing-508', 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600', 'Desk Lamp', 85, 0.5, 0.5, 1, 0, 1),
  item('picker-9', 'listing-509', 'https://images.unsplash.com/photo-1567096535036-5497076b854f?w=600', 'Ceramic Vase', 65, 0.5, 0.5, 1, 0, 1),
  item('picker-10', 'listing-510', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600', 'Field Watch', 320, 0.5, 0.5, 1, 0, 1),
];

// ---------------------------------------------------------------------------
// In-memory store for demo mutations (local-only, never persisted to backend)
// ---------------------------------------------------------------------------
let demoMoodboards: Moodboard[] = MOCK_MOODBOARDS.map((mb) => ({ ...mb }));
let demoIdCounter = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveTheme(themeId: string): MoodboardTheme {
  return MOCK_THEMES.find((t) => t.id === themeId) ?? MOCK_THEMES[0];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the current user's moodboards.
 * Returns moodboards sorted by most recently updated.
 */
export async function fetchMoodboards(): Promise<Moodboard[]> {
  await delay(400);
  return [...demoMoodboards].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

/**
 * Fetch a single moodboard with its items.
 * Returns null if the moodboard ID is not found.
 */
export async function fetchMoodboardDetail(id: string): Promise<Moodboard | null> {
  await delay(320);
  return demoMoodboards.find((mb) => mb.id === id) ?? null;
}

/**
 * Create a new moodboard with a title and theme.
 * In demo mode, the moodboard is stored in memory only — it is not persisted
 * to a backend or shared publicly.
 */
export async function createMoodboard(title: string, theme: string): Promise<Moodboard> {
  await delay(280);
  const themeObj = resolveTheme(theme);
  const newMoodboard: Moodboard = {
    id: `mb-demo-${++demoIdCounter}`,
    title,
    description: '',
    curator: 'You',
    curatorAvatar: 'https://ui-avatars.com/api/?name=You&background=111111&color=fff&size=128',
    items: [],
    coverImage: '',
    isPublic: false,
    theme: themeObj.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true,
  };
  demoMoodboards = [newMoodboard, ...demoMoodboards];
  return newMoodboard;
}

/**
 * Add an item (by listing ID) to a moodboard. The item is placed at the
 * canvas center with default scale and rotation.
 * In demo mode, the mutation is in-memory only.
 */
export async function addItemToMoodboard(
  moodboardId: string,
  listingId: string,
): Promise<MoodboardItem | null> {
  await delay(200);
  const moodboard = demoMoodboards.find((mb) => mb.id === moodboardId);
  if (!moodboard) return null;
  // Find the listing in picker items to get its image/title/price
  const source = MOCK_PICKER_ITEMS.find((p) => p.listingId === listingId);
  if (!source) return null;
  const newItem: MoodboardItem = {
    id: `item-demo-${++demoIdCounter}`,
    listingId: source.listingId,
    imageUri: source.imageUri,
    title: source.title,
    price: source.price,
    position: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
    addedAt: new Date().toISOString(),
    isDemo: true,
  };
  moodboard.items = [...moodboard.items, newItem];
  moodboard.updatedAt = new Date().toISOString();
  if (!moodboard.coverImage) {
    moodboard.coverImage = source.imageUri;
  }
  return newItem;
}

/**
 * Remove an item from a moodboard.
 * In demo mode, the mutation is in-memory only.
 */
export async function removeItemFromMoodboard(
  moodboardId: string,
  itemId: string,
): Promise<boolean> {
  await delay(180);
  const moodboard = demoMoodboards.find((mb) => mb.id === moodboardId);
  if (!moodboard) return false;
  const before = moodboard.items.length;
  moodboard.items = moodboard.items.filter((it) => it.id !== itemId);
  moodboard.updatedAt = new Date().toISOString();
  if (moodboard.items.length === 0) {
    moodboard.coverImage = '';
  }
  return moodboard.items.length < before;
}

/**
 * Update the position (x, y, scale, rotation) of an item on the canvas.
 * In demo mode, the mutation is in-memory only.
 */
export async function updateItemPosition(
  moodboardId: string,
  itemId: string,
  position: MoodboardItemPosition,
): Promise<boolean> {
  await delay(120);
  const moodboard = demoMoodboards.find((mb) => mb.id === moodboardId);
  if (!moodboard) return false;
  const itemIdx = moodboard.items.findIndex((it) => it.id === itemId);
  if (itemIdx === -1) return false;
  moodboard.items[itemIdx] = {
    ...moodboard.items[itemIdx],
    position,
  };
  moodboard.updatedAt = new Date().toISOString();
  return true;
}

/**
 * Reorder an item's layer (bring to front or send to back).
 * In demo mode, the mutation is in-memory only.
 */
export async function reorderItem(
  moodboardId: string,
  itemId: string,
  direction: 'front' | 'back',
): Promise<boolean> {
  await delay(120);
  const moodboard = demoMoodboards.find((mb) => mb.id === moodboardId);
  if (!moodboard) return false;
  const idx = moodboard.items.findIndex((it) => it.id === itemId);
  if (idx === -1) return false;
  const [moved] = moodboard.items.splice(idx, 1);
  if (direction === 'front') {
    moodboard.items.push(moved);
  } else {
    moodboard.items.unshift(moved);
  }
  moodboard.updatedAt = new Date().toISOString();
  return true;
}

/**
 * Fetch available moodboard themes for the canvas background.
 */
export async function fetchMoodboardThemes(): Promise<MoodboardTheme[]> {
  await delay(200);
  return [...MOCK_THEMES];
}

/**
 * Fetch public moodboards for the discovery surface.
 * Returns public moodboards sorted by most recently updated.
 */
export async function fetchPublicMoodboards(): Promise<Moodboard[]> {
  await delay(420);
  return demoMoodboards
    .filter((mb) => mb.isPublic)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Fetch items available to add to a moodboard (from saved items, recently
 * viewed, or search). In demo mode, returns a fixed set of mock listings.
 */
export async function fetchPickerItems(): Promise<MoodboardItem[]> {
  await delay(300);
  return [...MOCK_PICKER_ITEMS];
}

/**
 * Resolve a theme by its ID. Synchronous helper for UI layers that need
 * the theme object without a network call.
 */
export function getThemeById(themeId: string): MoodboardTheme {
  return resolveTheme(themeId);
}
