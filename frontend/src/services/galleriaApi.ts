/**
 * Galleria API — editorial discovery & curated collection layer
 *
 * This service provides the data contract and mock implementation for the
 * ThryftVerse Galleria — a premium editorial discovery surface for Co-Own
 * assets and curated collections. It is the documented differentiator for
 * ThryftVerse (per AGENTS.md §6, #1 recommended expansion department).
 *
 * The Galleria is NOT a product grid. It is an authored editorial experience
 * combining Pinterest's visual discovery, Grailed's staff picks, Depop's
 * moodboard collaging, and a museum gallery's curation.
 *
 * Per AGENTS.md §11 (Truthful UI): the mock data is flagged via
 * `GALLERIA_DEMO_MODE` and every entity carries `isDemo: true` so the UI can
 * show an honest "Demo mode" indicator. We never fabricate that a collection
 * or editorial is backed by a real backend.
 *
 * The service is mock-ready — the function signatures mirror what a real
 * editorial CMS / curation API would expose. When a real backend is wired,
 * set `GALLERIA_DEMO_MODE = false` and replace the mock branches with real
 * fetch calls. The UI layer does not need to change.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A curated collection of Co-Own assets, authored by a curator. */
export interface GalleriaCollection {
  id: string;
  title: string;
  subtitle: string;
  /** Curator display name. */
  curator: string;
  /** Curator avatar URL. */
  curatorAvatar: string;
  coverImage: string;
  /** Theme / mood descriptor (e.g. "Archive", "Modernist", "Heritage"). */
  theme: string;
  /** ISO timestamp of publication. */
  publishedAt: string;
  /** Item IDs belonging to this collection. */
  itemIds: string[];
  /** Honest flag — true while this collection comes from mock data. */
  isDemo: boolean;
}

/** An editorial piece — long-form content about a collection, asset, or theme. */
export interface GalleriaEditorial {
  id: string;
  title: string;
  excerpt: string;
  heroImage: string;
  author: string;
  authorAvatar: string;
  /** ISO timestamp of publication. */
  publishedAt: string;
  /** Human-readable read time (e.g. "5 min read"). */
  readTime: string;
  /** Body content — array of paragraph strings for rendering. */
  content: string[];
  /** Honest flag — true while this editorial comes from mock data. */
  isDemo: boolean;
}

/** A featured Co-Own asset surfaced in the Galleria discovery grid. */
export interface GalleriaFeaturedAsset {
  id: string;
  title: string;
  /** Current valuation in GBP. */
  valuation: number;
  image: string;
  /** Collection name this asset belongs to. */
  collection: string;
  /** Short editorial story / provenance note. */
  story: string;
  /** Aspect ratio (height / width) for masonry layout. */
  aspectRatio: number;
  /** Honest flag — true while this asset comes from mock data. */
  isDemo: boolean;
  /** Canonical reference kind for navigation. Always 'co_own' for Galleria assets. */
  referenceKind: 'co_own';
}

/** Full collection detail — collection metadata + resolved item summaries. */
export interface GalleriaCollectionDetail {
  collection: GalleriaCollection;
  items: GalleriaFeaturedAsset[];
}

// ---------------------------------------------------------------------------
// Demo flag — the UI reads this to decide whether to show a "Demo mode" badge.
// When a real backend is wired, set this to false (or remove the mock branch).
// ---------------------------------------------------------------------------

export const GALLERIA_DEMO_MODE = __DEV__;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
// Images use Unsplash source URLs (the same pattern as marketApi and
// liveShoppingApi mock assets). Curator/author avatars use UI-avatars.com so
// they render without a backend.

const NOW = Date.now();
const isoDaysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

const MOCK_COLLECTIONS: GalleriaCollection[] = [
  {
    id: 'g-col-1',
    title: 'The Archive Vault',
    subtitle: 'Heritage pieces with documented provenance',
    curator: 'Eleanor Vance',
    curatorAvatar: 'https://ui-avatars.com/api/?name=EV&background=1C5631&color=fff&size=128',
    coverImage: 'https://images.unsplash.com/photo-1591348278863-a8fb3887e2aa?w=800',
    theme: 'Heritage',
    publishedAt: isoDaysAgo(2),
    itemIds: ['g-asset-1', 'g-asset-2', 'g-asset-3', 'g-asset-4'],
    isDemo: true,
  },
  {
    id: 'g-col-2',
    title: 'Modernist Objects',
    subtitle: 'Clean lines, functional beauty, 20th-century design',
    curator: 'Marcus Chen',
    curatorAvatar: 'https://ui-avatars.com/api/?name=MC&background=06489A&color=fff&size=128',
    coverImage: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800',
    theme: 'Modernist',
    publishedAt: isoDaysAgo(5),
    itemIds: ['g-asset-5', 'g-asset-6', 'g-asset-7'],
    isDemo: true,
  },
  {
    id: 'g-col-3',
    title: 'Quiet Luxury',
    subtitle: 'Understated pieces for the considered collector',
    curator: 'Sofia Lindqvist',
    curatorAvatar: 'https://ui-avatars.com/api/?name=SL&background=7B0E1E&color=fff&size=128',
    coverImage: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800',
    theme: 'Quiet Luxury',
    publishedAt: isoDaysAgo(8),
    itemIds: ['g-asset-8', 'g-asset-2', 'g-asset-5'],
    isDemo: true,
  },
  {
    id: 'g-col-4',
    title: 'The Watch Department',
    subtitle: 'Horological significance across five decades',
    curator: 'James Okonkwo',
    curatorAvatar: 'https://ui-avatars.com/api/?name=JO&background=C9A46A&color=fff&size=128',
    coverImage: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800',
    theme: 'Horology',
    publishedAt: isoDaysAgo(12),
    itemIds: ['g-asset-3', 'g-asset-7', 'g-asset-1'],
    isDemo: true,
  },
  {
    id: 'g-col-5',
    title: 'Sculptural Form',
    subtitle: 'Where craft meets three-dimensional art',
    curator: 'Yuki Tanaka',
    curatorAvatar: 'https://ui-avatars.com/api/?name=YT&background=8A6A3F&color=fff&size=128',
    coverImage: 'https://images.unsplash.com/photo-1567096535036-5497076b854f?w=800',
    theme: 'Sculpture',
    publishedAt: isoDaysAgo(16),
    itemIds: ['g-asset-6', 'g-asset-4', 'g-asset-8'],
    isDemo: true,
  },
  {
    id: 'g-col-6',
    title: 'The Leather Atelier',
    subtitle: 'Patina, craft, and the marks of time',
    curator: 'Eleanor Vance',
    curatorAvatar: 'https://ui-avatars.com/api/?name=EV&background=1C5631&color=fff&size=128',
    coverImage: 'https://images.unsplash.com/photo-1547949003-9792a18a2601?w=800',
    theme: 'Craft',
    publishedAt: isoDaysAgo(20),
    itemIds: ['g-asset-2', 'g-asset-1', 'g-asset-6'],
    isDemo: true,
  },
];

const MOCK_EDITORIALS: GalleriaEditorial[] = [
  {
    id: 'g-ed-1',
    title: 'Why Provenance Is the New Provenance',
    excerpt: 'In an age of infinite reproduction, the story behind an object has become its most valuable attribute. We trace how documented ownership history is reshaping the collectibles market.',
    heroImage: 'https://images.unsplash.com/photo-1567427013949-0fb03cffa5f9?w=1200',
    author: 'Eleanor Vance',
    authorAvatar: 'https://ui-avatars.com/api/?name=EV&background=1C5631&color=fff&size=128',
    publishedAt: isoDaysAgo(1),
    readTime: '6 min read',
    content: [
      'In 2026, the collectibles market has undergone a quiet revolution. The objects themselves — watches, bags, sculptures — have not changed. What has changed is how we value the story they carry.',
      'Provenance, once the domain of auction houses and museum catalogues, has become the single most important factor in price discovery for heritage assets. A watch with a documented service history and original papers commands a premium that can exceed the intrinsic value of its materials by a factor of ten.',
      'ThryftVerse Co-Own was built on this principle. When you co-own a fraction of a heritage piece, you are not buying a share of metal and leather. You are buying a share of its story — its documented chain of custody, its cultural significance, its place in a lineage of craft.',
      'The Galleria is where these stories are told. Each collection is curated not by an algorithm, but by a person who has spent years studying a category. Each editorial piece is written by someone who has held the object, read its history, and understood its context.',
      'This is the difference between discovery and curation. Discovery shows you everything. Curation shows you what matters.',
    ],
    isDemo: true,
  },
  {
    id: 'g-ed-2',
    title: 'The Quiet Luxury Index',
    excerpt: 'Why the most valuable pieces in 2026 are the ones you would never recognise. A study in understatement, patina, and the economics of discretion.',
    heroImage: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200',
    author: 'Sofia Lindqvist',
    authorAvatar: 'https://ui-avatars.com/api/?name=SL&background=7B0E1E&color=fff&size=128',
    publishedAt: isoDaysAgo(4),
    readTime: '8 min read',
    content: [
      'The loudest objects are rarely the most valuable. This has always been true in art, and in 2026 it is increasingly true in collectibles.',
      'Quiet luxury is not a trend. It is a structural shift in how value is assigned. The pieces that appreciate are the ones that signal nothing to the uninitiated — a plain leather wallet with a fifty-year patina, a steel watch with no logo on the dial, a ceramic vessel that looks like it could have come from any studio.',
      'The market for these objects is driven by collectors who have moved past the signalling phase. They are not buying to be seen. They are buying to hold something that represents a standard of craft that no longer exists at scale.',
      'Co-Own makes this accessible. You do not need to buy the entire piece to participate in its appreciation. You need to recognise it — and recognition is what curation provides.',
    ],
    isDemo: true,
  },
  {
    id: 'g-ed-3',
    title: 'Horology Beyond the Hype',
    excerpt: 'The watches that matter in 2026 are not the ones on Instagram. A field guide to horological significance for the Co-Own era.',
    heroImage: 'https://images.unsplash.com/photo-1509048191080-d2984bad6ae5?w=1200',
    author: 'James Okonkwo',
    authorAvatar: 'https://ui-avatars.com/api/?name=JO&background=C9A46A&color=fff&size=128',
    publishedAt: isoDaysAgo(9),
    readTime: '5 min read',
    content: [
      'The watch market has been distorted by hype for the better part of a decade. Steel sports models from three manufacturers have absorbed the majority of speculative capital, leaving genuinely significant watches from other makers undervalued.',
      'The Galleria Watch Department exists to correct this. Our curators look past the hype cycle to identify pieces with genuine horological significance — movements that advanced the craft, designs that defined an era, and provenance that tells a story.',
      'Co-Own fractional ownership allows collectors to build a portfolio of horological significance without concentrating capital in a single hype-driven asset. A diversified watch portfolio, curated by experts, is now accessible at a fraction of the traditional entry cost.',
    ],
    isDemo: true,
  },
  {
    id: 'g-ed-4',
    title: 'The Sculptor\'s Hand',
    excerpt: 'Three-dimensional craft is having its moment. We explore why sculptural objects are the fastest-appreciating category in the Galleria.',
    heroImage: 'https://images.unsplash.com/photo-1564399579883-456a5c9e6f9d?w=1200',
    author: 'Yuki Tanaka',
    authorAvatar: 'https://ui-avatars.com/api/?name=YT&background=8A6A3F&color=fff&size=128',
    publishedAt: isoDaysAgo(14),
    readTime: '7 min read',
    content: [
      'For decades, sculpture was the overlooked category in collectibles. Two-dimensional art dominated the market, and three-dimensional craft was relegated to design fairs and museum shops.',
      'That is changing. A new generation of collectors, raised in a visual culture that values objects as much as images, is driving demand for sculptural work. Ceramics, bronzes, and carved objects are appreciating faster than any other category in the Galleria.',
      'The reason is tactile. Sculpture is the only collectible category that demands physical interaction to be fully appreciated. You must hold it, turn it, feel its weight. This creates a deeper connection than a painting on a wall ever can.',
      'Co-Own makes sculptural collecting accessible. Build a portfolio of significant three-dimensional works without the storage and display challenges that have historically gated this category.',
    ],
    isDemo: true,
  },
];

const MOCK_FEATURED_ASSETS: GalleriaFeaturedAsset[] = [
  {
    id: 'g-asset-1',
    title: '1968 Patek Philippe Calatrava',
    valuation: 48500,
    image: 'https://images.unsplash.com/photo-1587836374822-6eec36e1b636?w=800',
    collection: 'The Watch Department',
    story: 'Reference 2526, one of the first automatic watches produced in series. Original enamel dial, documented service history since 1971.',
    aspectRatio: 1.25,
    isDemo: true,
    referenceKind: 'co_own',
  },
  {
    id: 'g-asset-2',
    title: 'Hermès Birkin 30 Fauve',
    valuation: 32200,
    image: 'https://images.unsplash.com/photo-1591561954557-26941169b49e?w=800',
    collection: 'The Leather Atelier',
    story: 'Togo leather, palladium hardware. Single owner since 2015, full set with original box and dust bag. Exceptional patina.',
    aspectRatio: 1.08,
    isDemo: true,
    referenceKind: 'co_own',
  },
  {
    id: 'g-asset-3',
    title: 'Rolex Explorer 1016',
    valuation: 18900,
    image: 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=800',
    collection: 'The Watch Department',
    story: 'Gilt dial, 1967 production. Unpolished case with sharp bevels. One of the finest examples of the matte-dial era.',
    aspectRatio: 1.32,
    isDemo: true,
    referenceKind: 'co_own',
  },
  {
    id: 'g-asset-4',
    title: 'Georg Jensen Acorn Tea Set',
    valuation: 12400,
    image: 'https://images.unsplash.com/photo-1578500494198-246f628d5622?w=800',
    collection: 'The Archive Vault',
    story: 'Sterling silver, designed by Johan Rohde in 1915. This set produced in 1952. Original case, no monograms. Museum-quality provenance.',
    aspectRatio: 0.85,
    isDemo: true,
    referenceKind: 'co_own',
  },
  {
    id: 'g-asset-5',
    title: 'Eames Lounge Chair, Rosewood',
    valuation: 28700,
    image: 'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=800',
    collection: 'Modernist Objects',
    story: 'Original 1956 production with Brazilian rosewood shell. Documented by the Eames Foundation. Pre-1990 production, before the rosewood embargo.',
    aspectRatio: 1.18,
    isDemo: true,
    referenceKind: 'co_own',
  },
  {
    id: 'g-asset-6',
    title: 'Lucie Rie Studio Bowl',
    valuation: 8600,
    image: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=800',
    collection: 'Sculptural Form',
    story: 'Wheel-thrown stoneware with manganese glaze, c. 1978. Studio stamp present. From the collection of a London gallerist.',
    aspectRatio: 1.0,
    isDemo: true,
    referenceKind: 'co_own',
  },
  {
    id: 'g-asset-7',
    title: 'Cartier Tank Cintrée',
    valuation: 64300,
    image: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800',
    collection: 'The Watch Department',
    story: '1928 production, gold case. One of fewer than 100 known surviving examples. Ex-private European collection, sold with original Cartier archive extract.',
    aspectRatio: 1.4,
    isDemo: true,
    referenceKind: 'co_own',
  },
  {
    id: 'g-asset-8',
    title: 'Bottega Veneta Intrecciato Briefcase',
    valuation: 6200,
    image: 'https://images.unsplash.com/photo-1622560490174-8f949e6e2f1b?w=800',
    collection: 'Quiet Luxury',
    story: 'Calfskin, hand-woven Intrecciato. No visible logo. 2019 production, excellent condition. The definition of understated craft.',
    aspectRatio: 0.92,
    isDemo: true,
    referenceKind: 'co_own',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch curated collections for the Galleria discovery surface.
 * Returns collections sorted by most recently published.
 */
export async function fetchGalleriaCollections(): Promise<GalleriaCollection[]> {
  if (!GALLERIA_DEMO_MODE) {
    // Backend not yet available — return empty result (AGENTS.md §truthful-UI)
    return [];
  }
  await delay(420); // simulate network latency for honest loading states
  return [...MOCK_COLLECTIONS].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

/**
 * Fetch editorial pieces for the Galleria.
 * Returns editorials sorted by most recently published.
 */
export async function fetchGalleriaEditorials(): Promise<GalleriaEditorial[]> {
  if (!GALLERIA_DEMO_MODE) {
    // Backend not yet available — return empty result (AGENTS.md §truthful-UI)
    return [];
  }
  await delay(380);
  return [...MOCK_EDITORIALS].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

/**
 * Fetch featured Co-Own assets for the Galleria discovery grid.
 */
export async function fetchFeaturedAssets(): Promise<GalleriaFeaturedAsset[]> {
  if (!GALLERIA_DEMO_MODE) {
    // Backend not yet available — return empty result (AGENTS.md §truthful-UI)
    return [];
  }
  await delay(360);
  return [...MOCK_FEATURED_ASSETS];
}

/**
 * Fetch a single collection with its resolved items.
 * Returns null if the collection ID is not found.
 */
export async function fetchCollectionDetail(id: string): Promise<GalleriaCollectionDetail | null> {
  if (!GALLERIA_DEMO_MODE) {
    // Backend not yet available — return empty result (AGENTS.md §truthful-UI)
    return null;
  }
  await delay(320);
  const collection = MOCK_COLLECTIONS.find((c) => c.id === id) ?? null;
  if (!collection) return null;
  const items = MOCK_FEATURED_ASSETS.filter((a) => collection.itemIds.includes(a.id));
  return { collection, items };
}
