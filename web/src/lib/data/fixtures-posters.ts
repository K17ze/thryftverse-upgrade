/**
 * Posters-department fixtures — the signed-in member's poster story archive,
 * shoppable frame tags, and saved highlights. Shapes mirror the mobile
 * contracts in frontend/src/services/postersApi.ts:
 *  - PosterArchiveStory  → PosterStory (id, creatorId, frames, status,
 *    expiresAt, createdAt, uniqueViewerCount)
 *  - PosterTag           → POST /poster-stories/:id/tags rows (x/y are
 *    normalized 0–1 frame coordinates)
 *  - PosterHighlight     → PosterHighlight (title, cover, ordered frames)
 *
 * The archive is the member's own story history — stories the viewer
 * published under the demo identity ('me'). Timestamps are relative to
 * session start so "xh left" stays honest whenever the demo runs.
 */

const img = (id: string, w = 1200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();

// ============================================================================
// POSTER STORY ARCHIVE — the member's own 24h stories, active + expired
// ============================================================================

export interface PosterArchiveFrame {
  id: string;
  mediaUrl: string;
  caption?: string;
}

export interface PosterArchiveStory {
  id: string;
  creatorId: string;
  status: 'active' | 'archived';
  frames: PosterArchiveFrame[];
  createdAt: string;
  expiresAt: string;
  /** uniqueViewerCount — surfaced as "views" on archive cards. */
  viewCount: number;
}

export const POSTER_ARCHIVE: PosterArchiveStory[] = [
  {
    id: 'story-active-1',
    creatorId: 'me',
    status: 'active',
    createdAt: hoursAgo(11),
    expiresAt: hoursFromNow(13),
    viewCount: 214,
    frames: [
      { id: 'sa1-f1', mediaUrl: img('photo-1490481651871-ab68de25d43d'), caption: 'Rail refreshed — three vintage dresses up now' },
      { id: 'sa1-f2', mediaUrl: img('photo-1509631179647-0177331693ae'), caption: 'All under £90, shipping tomorrow' },
    ],
  },
  {
    id: 'story-active-2',
    creatorId: 'me',
    status: 'active',
    createdAt: hoursAgo(4),
    expiresAt: hoursFromNow(20),
    viewCount: 96,
    frames: [
      { id: 'sa2-f1', mediaUrl: img('photo-1552346154-21d32810aba3'), caption: 'Sneaker clean-up day — before pics' },
      { id: 'sa2-f2', mediaUrl: img('photo-1549298916-b41d501d3772') },
      { id: 'sa2-f3', mediaUrl: img('photo-1595341888016-a392ef81b7de'), caption: 'Jordan 1s going live at 7pm' },
    ],
  },
  {
    id: 'story-arc-1',
    creatorId: 'me',
    status: 'archived',
    createdAt: hoursAgo(30),
    expiresAt: hoursAgo(6),
    viewCount: 388,
    frames: [
      { id: 'sarc1-f1', mediaUrl: img('photo-1445205170230-053b83016050'), caption: 'Autumn capsule — first look' },
      { id: 'sarc1-f2', mediaUrl: img('photo-1544022613-e87ca75a784a'), caption: 'Wool, mohair, one leather jacket' },
    ],
  },
  {
    id: 'story-arc-2',
    creatorId: 'me',
    status: 'archived',
    createdAt: hoursAgo(96),
    expiresAt: hoursAgo(72),
    viewCount: 152,
    frames: [
      { id: 'sarc2-f1', mediaUrl: img('photo-1469334031218-e382a71b716b'), caption: 'Kilo sale haul — what survived the rail' },
    ],
  },
  {
    id: 'story-arc-3',
    creatorId: 'me',
    status: 'archived',
    createdAt: hoursAgo(168),
    expiresAt: hoursAgo(144),
    viewCount: 267,
    frames: [
      { id: 'sarc3-f1', mediaUrl: img('photo-1483985988355-763728e1935b'), caption: 'Market morning' },
      { id: 'sarc3-f2', mediaUrl: img('photo-1523381210434-271e8be1f52b'), caption: 'Denim table, £10 a pair' },
      { id: 'sarc3-f3', mediaUrl: img('photo-1520975954732-35dd22299614'), caption: 'Picked four — listing this week' },
    ],
  },
  {
    id: 'story-arc-4',
    creatorId: 'me',
    status: 'archived',
    createdAt: hoursAgo(340),
    expiresAt: hoursAgo(316),
    viewCount: 74,
    frames: [
      { id: 'sarc4-f1', mediaUrl: img('photo-1496747611176-843222e1e57c'), caption: 'Late summer dresses before they go' },
    ],
  },
];

export function archiveStoryById(id: string): PosterArchiveStory | undefined {
  return POSTER_ARCHIVE.find((s) => s.id === id);
}

// ============================================================================
// SHOPPABLE FRAME TAGS — product hotspots on feed posters, keyed by poster id.
// x/y are normalized frame coordinates (0–1), same contract as mobile tags.
// ============================================================================

export interface PosterTag {
  id: string;
  /** Listing the hotspot opens. */
  listingId: string;
  label: string;
  /** Frame the tag is pinned to (0-based); absent = first frame. */
  frameIndex?: number;
  x: number;
  y: number;
}

export const POSTER_TAGS: Record<string, PosterTag[]> = {
  p1: [
    { id: 'pt1', listingId: 'l14', label: 'Cashmere crew — £62', x: 0.3, y: 0.58 },
    { id: 'pt2', listingId: 'l23', label: 'Mohair cardigan — £74', x: 0.68, y: 0.72 },
  ],
  p2: [
    { id: 'pt3', listingId: 'l9', label: 'Oversized wool coat — £120', x: 0.5, y: 0.6 },
  ],
};

export function posterTagsFor(id: string): PosterTag[] {
  return POSTER_TAGS[id] ?? [];
}

// ============================================================================
// POSTER HIGHLIGHTS — saved story collections pinned under the member's
// profile/archive. Seeded from real archive frames; member-created
// highlights persist in the posterArchive store.
// ============================================================================

export interface PosterHighlightFrame {
  frameId: string;
  mediaUrl: string;
  caption?: string;
}

export interface PosterHighlight {
  id: string;
  title: string;
  coverUri: string;
  frames: PosterHighlightFrame[];
}

export const POSTER_HIGHLIGHTS: PosterHighlight[] = [
  {
    id: 'hl-drops',
    title: 'Drops',
    coverUri: img('photo-1490481651871-ab68de25d43d', 400),
    frames: [
      { frameId: 'sa1-f1', mediaUrl: img('photo-1490481651871-ab68de25d43d'), caption: 'Rail refreshed — three vintage dresses up now' },
      { frameId: 'sa2-f3', mediaUrl: img('photo-1595341888016-a392ef81b7de'), caption: 'Jordan 1s going live at 7pm' },
      { frameId: 'sarc1-f1', mediaUrl: img('photo-1445205170230-053b83016050'), caption: 'Autumn capsule — first look' },
    ],
  },
  {
    id: 'hl-finds',
    title: 'Finds',
    coverUri: img('photo-1523381210434-271e8be1f52b', 400),
    frames: [
      { frameId: 'sarc3-f2', mediaUrl: img('photo-1523381210434-271e8be1f52b'), caption: 'Denim table, £10 a pair' },
      { frameId: 'sarc2-f1', mediaUrl: img('photo-1469334031218-e382a71b716b'), caption: 'Kilo sale haul' },
    ],
  },
];
