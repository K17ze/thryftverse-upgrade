/**
 * Content-surfaces department — supplemental design dataset for the
 * moodboards / looks / galleria / poster-activity / outfit-builder cluster.
 * Shapes mirror the mobile contracts in frontend/src/services/moodboardApi.ts
 * and frontend/src/services/postersApi.ts 1:1 where the mobile contract
 * exists; deterministic generators are seeded so fixture output is stable
 * across renders and reloads (same input → same output, no Math.random()).
 *
 * Ownership: this file is the source of truth for content-surface demo
 * data. Live equivalents ship through lib/api/services/*; where no live
 * contract exists (poster activity, moodboard canvas/collaboration), the
 * stores persist member edits as local overlays on top of these fixtures.
 */

import type { Look } from '@/lib/contracts/domain';
import type { AppIconName } from '@/components/ui/Icon';
import { listingById, LOOKS, USERS } from '@/lib/data/fixtures';
import type { PosterArchiveStory } from '@/lib/data/fixtures-posters';

const img = (id: string, w = 1200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

// ============================================================================
// Deterministic PRNG — mulberry32 over an FNV-style string hash. Used for
// canvas scatter and poster-activity generation so every reload produces
// the identical dataset a seeded backend fixture would.
// ============================================================================

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFor(key: string): () => number {
  return mulberry32(hashString(key));
}

const pick = <T,>(r: () => number, arr: readonly T[]): T =>
  arr[Math.floor(r() * arr.length)];

// ============================================================================
// MOODBOARD THEMES — port of LOCAL_THEME_FALLBACK in mobile moodboardApi.ts.
// Colors are authored canvas design data (the board's background tint),
// identical to the mobile contract, not UI chrome tokens.
// ============================================================================

export interface MoodboardCanvasTheme {
  id: string;
  label: string;
  /** Canvas background tint — authored theme data, applied as a style. */
  backgroundColor: string;
  accentColor: string;
  fontColor: string;
}

export const MOODBOARD_THEMES: MoodboardCanvasTheme[] = [
  { id: 'theme-linen', label: 'Linen', backgroundColor: '#F7F4EE', accentColor: '#8A6A3F', fontColor: '#2A2A2A' },
  { id: 'theme-noir', label: 'Noir', backgroundColor: '#1A1A1A', accentColor: '#C9A46A', fontColor: '#F4F0E8' },
  { id: 'theme-sage', label: 'Sage', backgroundColor: '#E8EDE6', accentColor: '#4A6741', fontColor: '#2A3A28' },
  { id: 'theme-blush', label: 'Blush', backgroundColor: '#F5E6E4', accentColor: '#9A6B7A', fontColor: '#4A2A30' },
  { id: 'theme-stone', label: 'Stone', backgroundColor: '#E5E2DC', accentColor: '#6B6B6B', fontColor: '#333333' },
  { id: 'theme-midnight', label: 'Midnight', backgroundColor: '#0F1A2E', accentColor: '#4A7AC4', fontColor: '#E8EDF5' },
];

export const DEFAULT_MOODBOARD_THEME = MOODBOARD_THEMES[0];

export function moodboardThemeById(id: string | null | undefined): MoodboardCanvasTheme {
  return MOODBOARD_THEMES.find((t) => t.id === id) ?? DEFAULT_MOODBOARD_THEME;
}

// ============================================================================
// MOODBOARD CANVAS — freeform item placement, mirroring mobile
// MoodboardItemPosition { x, y, scale, rotation }. x/y are normalized 0–1
// canvas coordinates (item centre). Authored layouts ship for the fixture
// boards; items added later resolve through canvasPositionFor() below.
// ============================================================================

export interface MoodboardItemPosition {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

/** Authored collage layouts keyed by board id → listing id → position. */
export const MOODBOARD_CANVAS: Record<string, Record<string, MoodboardItemPosition>> = {
  // Autumn capsule — coats anchored centre-left, knitwear orbiting.
  mb1: {
    l9:  { x: 0.30, y: 0.30, scale: 1.30, rotation: -4 },
    l23: { x: 0.68, y: 0.22, scale: 1.10, rotation: 3 },
    l14: { x: 0.55, y: 0.52, scale: 1.20, rotation: -2 },
    l1:  { x: 0.18, y: 0.62, scale: 0.95, rotation: 6 },
    l26: { x: 0.82, y: 0.55, scale: 1.05, rotation: -6 },
    l21: { x: 0.40, y: 0.78, scale: 0.90, rotation: 2 },
    l12: { x: 0.70, y: 0.80, scale: 0.85, rotation: -3 },
    l6:  { x: 0.15, y: 0.24, scale: 0.80, rotation: 5 },
    l7:  { x: 0.88, y: 0.34, scale: 0.80, rotation: -5 },
    l15: { x: 0.60, y: 0.30, scale: 0.75, rotation: 4 },
    l5:  { x: 0.30, y: 0.86, scale: 0.78, rotation: -7 },
    l18: { x: 0.85, y: 0.72, scale: 0.72, rotation: 8 },
  },
  // Grails — tighter five-piece grid.
  mb2: {
    l8:  { x: 0.30, y: 0.32, scale: 1.25, rotation: -3 },
    l4:  { x: 0.66, y: 0.28, scale: 1.15, rotation: 4 },
    l28: { x: 0.50, y: 0.62, scale: 1.30, rotation: -2 },
    l17: { x: 0.20, y: 0.72, scale: 0.95, rotation: 5 },
    l10: { x: 0.78, y: 0.74, scale: 0.90, rotation: -6 },
  },
};

export const DEFAULT_MOODBOARD_THEME_ID: Record<string, string> = {
  mb1: 'theme-linen',
  mb2: 'theme-noir',
};

/**
 * Deterministic placement for items without an authored position — a
 * golden-angle scatter around the canvas centre, seeded by board + item
 * id so reloads (and shared boards) see the same layout.
 */
export function canvasPositionFor(
  boardId: string,
  itemId: string,
  index: number,
): MoodboardItemPosition {
  const r = rngFor(`canvas:${boardId}:${itemId}`);
  const angle = index * 2.399963 + r() * 0.6; // golden-angle spiral
  const radius = 0.12 + 0.34 * Math.min(1, index / 8) + r() * 0.05;
  return {
    x: Math.min(0.92, Math.max(0.08, 0.5 + Math.cos(angle) * radius)),
    y: Math.min(0.92, Math.max(0.08, 0.5 + Math.sin(angle) * radius * 0.8)),
    scale: 0.75 + r() * 0.5,
    rotation: Math.round((r() - 0.5) * 14),
  };
}

// ============================================================================
// PUBLIC MOODBOARDS — discovery rail on /moodboards. Boards authored by
// other members; itemIds resolve through listingById for collage covers.
// ============================================================================

export interface PublicMoodboard {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  themeId: string;
  itemIds: string[];
  coverUri: string;
  aspectRatio: number;
  createdAt: string;
  updatedAt: string;
}

export const PUBLIC_MOODBOARDS: PublicMoodboard[] = [
  {
    id: 'pub-mb-1',
    ownerId: 'u5',
    title: 'Archive neutrals',
    description: 'Margiela-era whites, bone and ecru — texture over logo.',
    themeId: 'theme-linen',
    itemIds: ['l9', 'l14', 'l23', 'l21', 'l12', 'l6'],
    coverUri: img('photo-1434389677669-e08b4cac3105', 800),
    aspectRatio: 0.75,
    createdAt: '2026-09-02T09:00:00Z',
    updatedAt: '2026-09-22T18:30:00Z',
  },
  {
    id: 'pub-mb-2',
    ownerId: 'u3',
    title: 'Gorpcore rotation',
    description: null,
    themeId: 'theme-midnight',
    itemIds: ['l4', 'l24', 'l13', 'l11', 'l16'],
    coverUri: img('photo-1556821840-3a63f95609a7', 800),
    aspectRatio: 0.8,
    createdAt: '2026-08-28T14:00:00Z',
    updatedAt: '2026-09-21T11:15:00Z',
  },
  {
    id: 'pub-mb-3',
    ownerId: 'u6',
    title: 'Silk evening',
    description: 'Bias-cut slips, soft tailoring, low heels.',
    themeId: 'theme-blush',
    itemIds: ['l6', 'l21', 'l12', 'l19'],
    coverUri: img('photo-1496747611176-843222e1e57c', 800),
    aspectRatio: 0.9,
    createdAt: '2026-09-10T20:00:00Z',
    updatedAt: '2026-09-20T09:45:00Z',
  },
  {
    id: 'pub-mb-4',
    ownerId: 'u1',
    title: 'Bag wall',
    description: 'The investment shelf — structured only.',
    themeId: 'theme-noir',
    itemIds: ['l8', 'l28', 'l25', 'l2'],
    coverUri: img('photo-1548036328-c9fa89d128fa', 800),
    aspectRatio: 0.85,
    createdAt: '2026-09-05T12:00:00Z',
    updatedAt: '2026-09-19T16:20:00Z',
  },
  {
    id: 'pub-mb-5',
    ownerId: 'u2',
    title: 'Workwear study',
    description: 'Chore coats, duck canvas, faded indigo.',
    themeId: 'theme-stone',
    itemIds: ['l3', 'l15', 'l18', 'l20', 'l7'],
    coverUri: img('photo-1520975954732-35dd22299614', 800),
    aspectRatio: 0.78,
    createdAt: '2026-08-14T08:00:00Z',
    updatedAt: '2026-09-18T13:00:00Z',
  },
  {
    id: 'pub-mb-6',
    ownerId: 'u4',
    title: 'Soft tailoring',
    description: null,
    themeId: 'theme-sage',
    itemIds: ['l15', 'l26', 'l18', 'l20'],
    coverUri: img('photo-1507679799987-c73779587ccf', 800),
    aspectRatio: 0.82,
    createdAt: '2026-09-12T10:30:00Z',
    updatedAt: '2026-09-17T19:10:00Z',
  },
  {
    id: 'pub-mb-7',
    ownerId: 'u5',
    title: 'Denim, always',
    description: 'Every wash worth keeping.',
    themeId: 'theme-midnight',
    itemIds: ['l5', 'l16', 'l20', 'l22', 'l7', 'l1'],
    coverUri: img('photo-1611312449408-fcece27cdbb7', 800),
    aspectRatio: 0.8,
    createdAt: '2026-07-30T15:00:00Z',
    updatedAt: '2026-09-16T08:40:00Z',
  },
  {
    id: 'pub-mb-8',
    ownerId: 'u3',
    title: 'Court classics',
    description: null,
    themeId: 'theme-linen',
    itemIds: ['l4', 'l27', 'l13', 'l24'],
    coverUri: img('photo-1595341888016-a392ef81b7de', 800),
    aspectRatio: 0.88,
    createdAt: '2026-09-08T17:00:00Z',
    updatedAt: '2026-09-15T12:00:00Z',
  },
];

export function publicMoodboardById(id: string): PublicMoodboard | undefined {
  return PUBLIC_MOODBOARDS.find((b) => b.id === id);
}

// ============================================================================
// MOODBOARD COMMENTS / MEMBERS / INVITES / VERSIONS — collaboration
// fixtures mirroring moodboardApi.ts contracts. Authoring overlays live
// in lib/store/moodboardCollab.ts; these are the seeded base rows.
// ============================================================================

export type MoodboardRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export interface MoodboardCommentRow {
  id: string;
  boardId: string;
  authorId: string;
  /** Anchored canvas/listing item, or null for a board-level comment. */
  itemId: string | null;
  body: string;
  resolved: boolean;
  createdAt: string;
}

export interface MoodboardMemberRow {
  boardId: string;
  userId: string;
  role: MoodboardRole;
  joinedAt: string;
}

export type MoodboardInviteState = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface MoodboardInviteRow {
  id: string;
  boardId: string;
  role: Exclude<MoodboardRole, 'owner'>;
  state: MoodboardInviteState;
  createdAt: string;
  expiresAt: string;
}

export interface MoodboardVersionRow {
  id: string;
  boardId: string;
  revision: number;
  label: string | null;
  source: 'manual' | 'auto' | 'restore';
  isPinned: boolean;
  createdAt: string;
  createdById: string;
  /** Board snapshot — enough to preview and restore. */
  itemIds: string[];
  positions?: Record<string, MoodboardItemPosition>;
  themeId?: string;
}

export const MOODBOARD_COMMENTS: MoodboardCommentRow[] = [
  {
    id: 'mbc-1',
    boardId: 'mb1',
    authorId: 'u5',
    itemId: 'l9',
    body: 'This coat is the anchor — keep it centre.',
    resolved: false,
    createdAt: '2026-09-21T19:20:00Z',
  },
  {
    id: 'mbc-2',
    boardId: 'mb1',
    authorId: 'u6',
    itemId: null,
    body: 'Swap the boots for a lower heel and this is perfect.',
    resolved: false,
    createdAt: '2026-09-22T08:45:00Z',
  },
  {
    id: 'mbc-3',
    boardId: 'mb1',
    authorId: 'me',
    itemId: 'l14',
    body: 'Trying the cream knit instead of grey — compare later.',
    resolved: true,
    createdAt: '2026-09-20T16:10:00Z',
  },
  {
    id: 'mbc-4',
    boardId: 'pub-mb-1',
    authorId: 'u6',
    itemId: null,
    body: 'The texture mix on the second row is so good.',
    resolved: false,
    createdAt: '2026-09-21T11:00:00Z',
  },
];

export const MOODBOARD_MEMBERS: MoodboardMemberRow[] = [
  { boardId: 'mb1', userId: 'me', role: 'owner', joinedAt: '2026-09-15T10:00:00Z' },
  { boardId: 'mb1', userId: 'u5', role: 'editor', joinedAt: '2026-09-16T09:30:00Z' },
  { boardId: 'mb1', userId: 'u6', role: 'commenter', joinedAt: '2026-09-18T14:00:00Z' },
  { boardId: 'mb2', userId: 'me', role: 'owner', joinedAt: '2026-09-10T10:00:00Z' },
  { boardId: 'pub-mb-1', userId: 'u5', role: 'owner', joinedAt: '2026-09-02T09:00:00Z' },
  { boardId: 'pub-mb-1', userId: 'u6', role: 'editor', joinedAt: '2026-09-04T10:00:00Z' },
];

export const MOODBOARD_INVITES: MoodboardInviteRow[] = [
  {
    id: 'mbi-1',
    boardId: 'mb2',
    role: 'viewer',
    state: 'pending',
    createdAt: '2026-09-23T12:00:00Z',
    expiresAt: '2026-10-23T12:00:00Z',
  },
];

export const MOODBOARD_VERSIONS: MoodboardVersionRow[] = [
  {
    id: 'mbv-1',
    boardId: 'mb1',
    revision: 3,
    label: 'Before the swap',
    source: 'manual',
    isPinned: true,
    createdAt: '2026-09-19T21:00:00Z',
    createdById: 'me',
    itemIds: ['l9', 'l23', 'l14', 'l1', 'l26', 'l21', 'l12', 'l6'],
    positions: MOODBOARD_CANVAS.mb1,
    themeId: 'theme-linen',
  },
  {
    id: 'mbv-2',
    boardId: 'mb1',
    revision: 6,
    label: null,
    source: 'auto',
    isPinned: false,
    createdAt: '2026-09-21T18:05:00Z',
    createdById: 'me',
    itemIds: ['l9', 'l23', 'l14', 'l1', 'l26', 'l21', 'l12', 'l6', 'l7', 'l15'],
    positions: MOODBOARD_CANVAS.mb1,
    themeId: 'theme-linen',
  },
  {
    id: 'mbv-3',
    boardId: 'mb1',
    revision: 9,
    label: null,
    source: 'auto',
    isPinned: false,
    createdAt: '2026-09-22T10:40:00Z',
    createdById: 'u5',
    itemIds: MOODBOARD_CANVAS.mb1 ? Object.keys(MOODBOARD_CANVAS.mb1) : [],
    positions: MOODBOARD_CANVAS.mb1,
    themeId: 'theme-linen',
  },
  {
    id: 'mbv-4',
    boardId: 'mb2',
    revision: 2,
    label: 'Five grails',
    source: 'manual',
    isPinned: false,
    createdAt: '2026-09-11T15:00:00Z',
    createdById: 'me',
    itemIds: Object.keys(MOODBOARD_CANVAS.mb2),
    positions: MOODBOARD_CANVAS.mb2,
    themeId: 'theme-noir',
  },
];

// ============================================================================
// LOOKS — extra fixture looks so the related rail has real depth beyond
// the three seeded in fixtures.ts. Same Look contract.
// ============================================================================

export const EXTRA_LOOKS: Look[] = [
  {
    id: 'look-4',
    creatorId: 'u1',
    coverImageUri: img('photo-1509631179647-0177331693ae', 900),
    coverAspectRatio: 0.78,
    title: 'Knits on knits',
    itemIds: ['l14', 'l23', 'l9'],
    likeCount: 187,
    createdAt: '2026-09-17T15:00:00Z',
  },
  {
    id: 'look-5',
    creatorId: 'u2',
    coverImageUri: img('photo-1591047139829-d91aecb6caea', 900),
    coverAspectRatio: 0.8,
    title: 'Chore coat season',
    itemIds: ['l3', 'l18', 'l15'],
    likeCount: 96,
    createdAt: '2026-09-16T11:00:00Z',
  },
  {
    id: 'look-6',
    creatorId: 'u5',
    coverImageUri: img('photo-1434389677669-e08b4cac3105', 900),
    coverAspectRatio: 0.72,
    title: 'All cream everything',
    itemIds: ['l21', 'l26', 'l19'],
    likeCount: 412,
    createdAt: '2026-09-15T18:00:00Z',
  },
  {
    id: 'look-7',
    creatorId: 'u3',
    coverImageUri: img('photo-1512353087810-25dfcd100962', 900),
    coverAspectRatio: 0.85,
    title: 'Retro runners',
    itemIds: ['l27', 'l4', 'l11'],
    likeCount: 274,
    createdAt: '2026-09-14T09:00:00Z',
  },
  {
    id: 'look-8',
    creatorId: 'u6',
    coverImageUri: img('photo-1595777457583-95e059d581b8', 900),
    coverAspectRatio: 0.76,
    title: 'Slip dress, two ways',
    itemIds: ['l6', 'l12', 'l19'],
    likeCount: 158,
    createdAt: '2026-09-13T20:00:00Z',
  },
];

export function allLooks(): Look[] {
  return [...LOOKS, ...EXTRA_LOOKS];
}

export function lookById(id: string): Look | undefined {
  return allLooks().find((l) => l.id === id);
}

/**
 * Related-look ranking — mirrors mobile useRelatedLooks semantics
 * (server-ranked) with a deterministic local scorer: same creator first,
 * then shared listing categories, then like count. Excludes the look
 * itself and any listing-less dead ends.
 */
export function relatedLooksFor(lookId: string, limit = 8): Look[] {
  const source = lookById(lookId);
  if (!source) return [];
  const sourceCats = new Set(
    source.itemIds
      .map((id) => listingById(id)?.category)
      .filter((c): c is string => Boolean(c)),
  );
  return allLooks()
    .filter((l) => l.id !== lookId)
    .map((l) => {
      const shared = l.itemIds.reduce(
        (n, id) => n + (sourceCats.has(listingById(id)?.category ?? '') ? 1 : 0),
        0,
      );
      const creatorBonus = l.creatorId === source.creatorId ? 3 : 0;
      return { look: l, score: creatorBonus + shared + (l.likeCount ?? 0) / 1000 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.look);
}

export function usernameById(userId: string): string {
  return USERS.find((u) => u.id === userId)?.username ?? userId;
}

// ============================================================================
// POSTER STORY ACTIVITY — deterministic fixture contract mirroring
// PosterStoryActivity in mobile postersApi.ts (viewers, reactions,
// replies, styleVotes). No live activity endpoint exists on web yet, so
// this seeded generator stands in: same story id → identical dataset.
// ============================================================================

export interface PosterStoryActivityViewer {
  userId: string;
  username: string | null;
  avatar: string | null;
  viewedFrameCount: number;
  latestViewedAt: string;
}

export interface PosterStoryActivityReaction {
  userId: string;
  username: string | null;
  avatar: string | null;
  frameId: string;
  reaction: string;
  createdAt: string;
}

export interface PosterStoryActivityReply {
  id: string;
  authorId: string;
  authorUsername: string | null;
  authorAvatar: string | null;
  frameId: string;
  body: string;
  createdAt: string;
}

export interface PosterStoryActivityStyleVote {
  stickerId: string;
  userId: string;
  username: string | null;
  optionId: string;
  createdAt: string;
}

export interface PosterStoryActivity {
  storyId: string;
  viewers: PosterStoryActivityViewer[];
  reactions: PosterStoryActivityReaction[];
  replies: PosterStoryActivityReply[];
  styleVotes: PosterStoryActivityStyleVote[];
}

/** Style-vote sticker definitions for stories that carried one — declared
 *  as authored fixture data so vote rows have a real sticker to reference. */
export interface PosterStoryStickerFixture {
  id: string;
  storyId: string;
  label: string;
  options: { id: string; label: string }[];
}

export const POSTER_STORY_STICKERS: PosterStoryStickerFixture[] = [
  {
    id: 'stk-arc1-knit',
    storyId: 'story-arc-1',
    label: 'Which knit stays?',
    options: [
      { id: 'opt-cream', label: 'Cream mohair' },
      { id: 'opt-grey', label: 'Grey cashmere' },
    ],
  },
];

export const POSTER_REACTIONS = ['love', 'fire', 'style', 'want', 'wow', 'laugh'] as const;
export type PosterReaction = (typeof POSTER_REACTIONS)[number];

/** Icon + label map for reaction rows — web uses the Icon family, not emoji. */
export const POSTER_REACTION_META: Record<PosterReaction, { icon: AppIconName; label: string }> = {
  love: { icon: 'heart', label: 'Love' },
  fire: { icon: 'fire', label: 'Fire' },
  style: { icon: 'sparkles', label: 'Style' },
  want: { icon: 'bag', label: 'Want' },
  wow: { icon: 'star', label: 'Wow' },
  laugh: { icon: 'zap', label: 'Laugh' },
};

const VIEWER_FIRST = [
  'mara', 'jules', 'otto', 'fran', 'nia', 'sol', 'ida', 'rex',
  'tamsin', 'cale', 'piper', 'wren', 'beau', 'lotta', 'kit', 'noor',
] as const;
const VIEWER_LAST = [
  'threads', 'vintage', 'archive', 'finds', 'studio', 'rack',
  'seam', 'weft', 'cloth', 'rail', 'hem', 'moth',
] as const;

const REPLY_BODIES = [
  'Is the second frame still available?',
  'That last piece is unreal — what size?',
  'Saving this. Drop day?',
  'Shipping to Bristol?',
  'The styling on frame one, honestly',
  'Price on the coat?',
  'Following for the restock',
  'This is the best rail you have done',
] as const;

/**
 * posterActivityFor — seeded generator producing the full
 * PosterStoryActivity shape for a story. Deterministic by story.id:
 * viewer handles are generated, counts scale off the real viewCount,
 * timestamps spread across the story's active window.
 */
export function posterActivityFor(story: PosterArchiveStory): PosterStoryActivity {
  const r = rngFor(`activity:${story.id}`);
  const frameIds = story.frames.map((f) => f.id);
  const start = new Date(story.createdAt).getTime();
  const end = new Date(story.expiresAt).getTime();
  const window = Math.max(1, end - start);
  const at = (t: number) => new Date(start + Math.floor(t * window)).toISOString();

  // Real fixture users appear first (recognisable community), then
  // generated member handles fill out the viewer list.
  const known = USERS.filter((u) => u.id !== 'me');
  const viewerCount = Math.min(story.viewCount, 60); // list caps at 60 rows
  const usedHandles = new Set<string>(known.map((u) => u.username));
  const viewers: PosterStoryActivityViewer[] = [];

  for (let i = 0; i < viewerCount; i += 1) {
    let userId: string;
    let username: string | null;
    let avatar: string | null;
    if (i < known.length) {
      const u = known[i];
      userId = u.id;
      username = u.username;
      avatar = u.avatar;
    } else {
      let handle = '';
      do {
        handle = `${pick(r, VIEWER_FIRST)}.${pick(r, VIEWER_LAST)}${Math.floor(r() * 90 + 10)}`;
      } while (usedHandles.has(handle));
      usedHandles.add(handle);
      userId = `pv-${story.id}-${i}`;
      username = handle;
      avatar = null;
    }
    viewers.push({
      userId,
      username,
      avatar,
      viewedFrameCount: Math.min(frameIds.length, 1 + Math.floor(r() * frameIds.length)),
      latestViewedAt: at(Math.pow(r(), 0.7)),
    });
  }
  viewers.sort((a, b) => b.latestViewedAt.localeCompare(a.latestViewedAt));

  // ~28% of viewers reacted, weighted to the first frame.
  const reactions: PosterStoryActivityReaction[] = [];
  viewers.forEach((v) => {
    if (r() < 0.28) {
      const frameIndex = r() < 0.7 ? 0 : Math.floor(r() * frameIds.length);
      reactions.push({
        userId: v.userId,
        username: v.username,
        avatar: v.avatar,
        frameId: frameIds[Math.min(frameIndex, frameIds.length - 1)],
        reaction: pick(r, POSTER_REACTIONS),
        createdAt: at(r()),
      });
    }
  });
  reactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // ~8% replied with a short DM-style message.
  const replies: PosterStoryActivityReply[] = [];
  viewers.forEach((v, i) => {
    if (r() < 0.08 && replies.length < 8) {
      replies.push({
        id: `preply-${story.id}-${i}`,
        authorId: v.userId,
        authorUsername: v.username,
        authorAvatar: v.avatar,
        frameId: frameIds[Math.floor(r() * frameIds.length)],
        body: pick(r, REPLY_BODIES),
        createdAt: at(r()),
      });
    }
  });
  replies.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Style-vote stickers — only stories that carried one.
  const stickers = POSTER_STORY_STICKERS.filter((s) => s.storyId === story.id);
  const styleVotes: PosterStoryActivityStyleVote[] = [];
  stickers.forEach((stk) => {
    viewers.slice(0, Math.floor(viewers.length * 0.5)).forEach((v) => {
      if (r() < 0.6) {
        styleVotes.push({
          stickerId: stk.id,
          userId: v.userId,
          username: v.username,
          optionId: pick(r, stk.options).id,
          createdAt: at(r()),
        });
      }
    });
  });
  styleVotes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { storyId: story.id, viewers, reactions, replies, styleVotes };
}
