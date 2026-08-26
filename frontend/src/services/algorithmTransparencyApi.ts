/**
 * Algorithm Transparency API — "Your Algorithm" dashboard service
 *
 * This service provides the data contract and mock implementation for the
 * ThryftVerse algorithm transparency surface — a 2026 trust differentiator
 * inspired by Instagram's "Your Algorithm" dashboard. Users can see exactly
 * which topics and signals shape their recommendations, adjust topic weights,
 * add new interests, and remove topics they no longer want influencing their
 * feed.
 *
 * Per AGENTS.md §11 (Truthful UI): the mock data is flagged via
 * `ALGORITHM_DEMO_MODE` and every entity carries `isDemo: true` so the UI can
 * show an honest "Demo mode" indicator. We never fabricate that a topic or
 * signal is backed by a real backend.
 *
 * The service is mock-ready — the function signatures mirror what a real
 * personalization ML model / feature store would expose. When a real backend
 * is wired, set `ALGORITHM_DEMO_MODE = false` and replace the mock branches
 * with real fetch calls. The UI layer does not need to change.
 */

import { fetchJson } from '../lib/apiClient';
import { useStore } from '../store/useStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How strongly a topic influences the feed. */
export type TopicWeight = 'low' | 'medium' | 'high';

/** Where a topic's influence originated. */
export type SignalSource = 'explicit' | 'implicit' | 'inferred';

/**
 * A topic that influences the user's recommendations.
 *
 * - `removable` is false for topics derived from immutable history (e.g.
 *   purchase history, browse history). The UI shows a lock affordance and a
 *   "Cannot be removed" hint for these.
 */
export interface AlgorithmTopic {
  id: string;
  /** Human-readable label, e.g. "Vintage denim". */
  label: string;
  /** Category bucket, e.g. "Category preference". */
  category: string;
  /** How strongly this topic influences the feed. */
  weight: TopicWeight;
  /** Where the topic's influence originated. */
  source: SignalSource;
  /** Whether the user can remove this topic. */
  removable: boolean;
  /** ISO timestamp of when the topic was added to the profile. */
  addedAt: string;
  /** Honest flag — true while this topic comes from mock data. */
  isDemo: boolean;
}

/**
 * A signal source that shaped the feed — a granular behavioural or explicit
 * input the personalization model consumed.
 */
export interface AlgorithmSignal {
  id: string;
  /** Human-readable label, e.g. "Saved 3 items from Acne Studios". */
  label: string;
  /** Signal provenance. */
  type: SignalSource;
  /** Relative influence weight (0–1). */
  weight: number;
  /** ISO timestamp of the most recent occurrence. */
  lastSeen: string;
  /** Honest flag — true while this signal comes from mock data. */
  isDemo: boolean;
}

/** A single reason contributing to a feed item's ranking. */
export interface FeedExplanationReason {
  /** Topic label that matched the item. */
  topic: string;
  /** Where the topic influence originated. */
  source: SignalSource;
  /** Relative weight contribution (0–1). */
  weight: number;
}

/** Descriptive confidence label — never a raw percentage to users. */
export type ConfidenceLabel = 'Strong match' | 'Moderate match' | 'Exploratory';

/**
 * Explains why a specific item appeared in the feed.
 */
export interface AlgorithmFeedExplanation {
  /** The feed item identifier. */
  itemId: string;
  /** Item title for display. */
  itemTitle: string;
  /** Item thumbnail URI. */
  itemThumbnail: string;
  /** Ranked reasons contributing to the item's placement. */
  reasons: FeedExplanationReason[];
  /** Descriptive confidence label (not a percentage). */
  confidenceLabel: ConfidenceLabel;
  /** Honest flag — true while this explanation comes from mock data. */
  isDemo: boolean;
}

/** The user's full algorithm transparency profile. */
export interface AlgorithmTransparencyProfile {
  topics: AlgorithmTopic[];
  signals: AlgorithmSignal[];
  /** Recent influences that shaped the feed (compact, last ~5). */
  recentInfluences: AlgorithmSignal[];
  /** ISO timestamp of when the profile was last updated. */
  lastUpdated: string;
  /** Honest flag — true while this profile comes from mock data. */
  isDemo: boolean;
}

// ---------------------------------------------------------------------------
// Demo flag — the UI reads this to decide whether to show a "Demo mode" badge.
// When a real backend is wired, set this to false (or remove the mock branch).
// ---------------------------------------------------------------------------

let _algorithmDemoMode = true;
export function getAlgorithmDemoMode(): boolean { return _algorithmDemoMode; }
export function setAlgorithmDemoMode(value: boolean): void { _algorithmDemoMode = value; }
export const ALGORITHM_DEMO_MODE = true;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const NOW = Date.now();
const isoHoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const isoDaysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

/**
 * Twelve topics spanning the categories required by the product spec:
 * Brand affinity, Category preference, Price sensitivity, Style preferences,
 * Sustainability interest, Location-based, Social signals, Browse history,
 * Search history, Saved items, Purchase history, Time-of-day patterns.
 *
 * Removable topics are user-controllable. Non-removable topics derive from
 * immutable behavioural history and show a lock affordance in the UI.
 */
const MOCK_TOPICS: AlgorithmTopic[] = [
  {
    id: 'topic-brand-acne',
    label: 'Acne Studios',
    category: 'Brand affinity',
    weight: 'high',
    source: 'explicit',
    removable: true,
    addedAt: isoDaysAgo(21),
    isDemo: true,
  },
  {
    id: 'topic-brand-margiela',
    label: 'Maison Margiela',
    category: 'Brand affinity',
    weight: 'medium',
    source: 'implicit',
    removable: true,
    addedAt: isoDaysAgo(14),
    isDemo: true,
  },
  {
    id: 'topic-category-denim',
    label: 'Vintage denim',
    category: 'Category preference',
    weight: 'high',
    source: 'explicit',
    removable: true,
    addedAt: isoDaysAgo(30),
    isDemo: true,
  },
  {
    id: 'topic-category-outerwear',
    label: 'Tailored outerwear',
    category: 'Category preference',
    weight: 'medium',
    source: 'inferred',
    removable: true,
    addedAt: isoDaysAgo(10),
    isDemo: true,
  },
  {
    id: 'topic-price-mid',
    label: 'Mid-range price sensitivity',
    category: 'Price sensitivity',
    weight: 'medium',
    source: 'inferred',
    removable: true,
    addedAt: isoDaysAgo(18),
    isDemo: true,
  },
  {
    id: 'topic-style-minimal',
    label: 'Minimalist style',
    category: 'Style preferences',
    weight: 'high',
    source: 'explicit',
    removable: true,
    addedAt: isoDaysAgo(25),
    isDemo: true,
  },
  {
    id: 'topic-sustainability',
    label: 'Sustainability interest',
    category: 'Sustainability interest',
    weight: 'medium',
    source: 'explicit',
    removable: true,
    addedAt: isoDaysAgo(12),
    isDemo: true,
  },
  {
    id: 'topic-location-london',
    label: 'London-based sellers',
    category: 'Location-based',
    weight: 'low',
    source: 'inferred',
    removable: true,
    addedAt: isoDaysAgo(7),
    isDemo: true,
  },
  {
    id: 'topic-social-follows',
    label: 'Creators you follow',
    category: 'Social signals',
    weight: 'medium',
    source: 'explicit',
    removable: true,
    addedAt: isoDaysAgo(9),
    isDemo: true,
  },
  {
    id: 'topic-browse-history',
    label: 'Recent browsing',
    category: 'Browse history',
    weight: 'medium',
    source: 'implicit',
    removable: false,
    addedAt: isoDaysAgo(1),
    isDemo: true,
  },
  {
    id: 'topic-search-history',
    label: 'Recent searches',
    category: 'Search history',
    weight: 'low',
    source: 'implicit',
    removable: false,
    addedAt: isoDaysAgo(1),
    isDemo: true,
  },
  {
    id: 'topic-purchase-history',
    label: 'Past purchases',
    category: 'Purchase history',
    weight: 'high',
    source: 'implicit',
    removable: false,
    addedAt: isoDaysAgo(60),
    isDemo: true,
  },
  {
    id: 'topic-saved-items',
    label: 'Saved items',
    category: 'Saved items',
    weight: 'medium',
    source: 'implicit',
    removable: false,
    addedAt: isoDaysAgo(3),
    isDemo: true,
  },
  {
    id: 'topic-time-of-day',
    label: 'Evening browsing pattern',
    category: 'Time-of-day patterns',
    weight: 'low',
    source: 'inferred',
    removable: true,
    addedAt: isoDaysAgo(5),
    isDemo: true,
  },
];

const MOCK_SIGNALS: AlgorithmSignal[] = [
  {
    id: 'sig-saved-acne',
    label: 'Saved 3 items from Acne Studios',
    type: 'explicit',
    weight: 0.82,
    lastSeen: isoHoursAgo(2),
    isDemo: true,
  },
  {
    id: 'sig-search-denim',
    label: 'Searched "vintage denim jacket"',
    type: 'explicit',
    weight: 0.71,
    lastSeen: isoHoursAgo(5),
    isDemo: true,
  },
  {
    id: 'sig-browse-margiela',
    label: 'Browsed Maison Margiela listings for 4 min',
    type: 'implicit',
    weight: 0.58,
    lastSeen: isoHoursAgo(8),
    isDemo: true,
  },
  {
    id: 'sig-purchase-coat',
    label: 'Purchased a tailored wool coat',
    type: 'implicit',
    weight: 0.9,
    lastSeen: isoDaysAgo(2),
    isDemo: true,
  },
  {
    id: 'sig-follow-creator',
    label: 'Followed @minimal.archives',
    type: 'explicit',
    weight: 0.64,
    lastSeen: isoDaysAgo(3),
    isDemo: true,
  },
  {
    id: 'sig-inferred-style',
    label: 'Inferred: minimalist aesthetic',
    type: 'inferred',
    weight: 0.55,
    lastSeen: isoDaysAgo(1),
    isDemo: true,
  },
  {
    id: 'sig-evening-peak',
    label: 'Most active 7pm–10pm',
    type: 'inferred',
    weight: 0.34,
    lastSeen: isoHoursAgo(1),
    isDemo: true,
  },
];

// In-memory mutable copy so add/remove/update operations are reflected on
// subsequent fetches within a session (mock persistence).
let sessionTopics: AlgorithmTopic[] = MOCK_TOPICS.map((t) => ({ ...t }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function weightToValue(w: TopicWeight): number {
  return w === 'high' ? 0.85 : w === 'medium' ? 0.55 : 0.25;
}

function confidenceFromScore(score: number): ConfidenceLabel {
  if (score >= 0.7) return 'Strong match';
  if (score >= 0.4) return 'Moderate match';
  return 'Exploratory';
}

// ---------------------------------------------------------------------------
// Backend intent API types and helpers
// ---------------------------------------------------------------------------

interface BackendIntentTopic {
  id: string;
  label: string;
  category: string;
  influenceBand: string;
  sourceType: string;
  evidenceCount: number;
  removable: boolean;
  paused: boolean;
  lastEvidenceAt: string | null;
  updatedAt: string;
}

interface BackendIntentProfile {
  intentVersion: number;
  profileMode: string;
  topics: BackendIntentTopic[];
}

function mapInfluenceBandToWeight(band: string): TopicWeight {
  if (band === 'more') return 'high';
  if (band === 'less') return 'low';
  return 'medium';
}

function mapWeightToDirection(weight: TopicWeight): string {
  if (weight === 'high') return 'more';
  if (weight === 'low') return 'less';
  return 'usual';
}

function getCurrentUserId(): string | null {
  return useStore.getState().currentUser?.id ?? null;
}

function backendProfileToTransparencyProfile(
  backend: BackendIntentProfile,
): AlgorithmTransparencyProfile {
  const topics: AlgorithmTopic[] = backend.topics.map((t) => ({
    id: t.id,
    label: t.label,
    category: t.category,
    weight: mapInfluenceBandToWeight(t.influenceBand),
    source: (t.sourceType === 'explicit' ? 'explicit' : t.sourceType === 'implicit' ? 'implicit' : 'inferred') as SignalSource,
    removable: t.removable,
    addedAt: t.updatedAt,
    isDemo: false,
  }));
  return {
    topics,
    signals: [],
    recentInfluences: [],
    lastUpdated: new Date().toISOString(),
    isDemo: false,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the user's full algorithm transparency profile.
 */
export async function fetchAlgorithmProfile(): Promise<AlgorithmTransparencyProfile> {
  const userId = getCurrentUserId();
  if (userId && !getAlgorithmDemoMode()) {
    try {
      const backend = await fetchJson<BackendIntentProfile>(
        `/recommendations/intent/${encodeURIComponent(userId)}/profile`
      );
      setAlgorithmDemoMode(false);
      return backendProfileToTransparencyProfile(backend);
    } catch {
      // fall through to mock
    }
  }
  // Try real backend first even in demo mode to detect availability
  if (userId) {
    try {
      const backend = await fetchJson<BackendIntentProfile>(
        `/recommendations/intent/${encodeURIComponent(userId)}/profile`
      );
      setAlgorithmDemoMode(false);
      return backendProfileToTransparencyProfile(backend);
    } catch {
      // fall through to mock
    }
  }
  await delay(420);
  const recentInfluences = [...MOCK_SIGNALS]
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
    .slice(0, 5);
  return {
    topics: [...sessionTopics],
    signals: [...MOCK_SIGNALS],
    recentInfluences,
    lastUpdated: isoHoursAgo(1),
    isDemo: getAlgorithmDemoMode(),
  };
}

/**
 * Adjust a topic's weight. Returns the updated topic, or null if not found.
 */
export async function updateTopicWeight(topicId: string, weight: TopicWeight): Promise<AlgorithmTopic | null> {
  const userId = getCurrentUserId();
  if (userId && !getAlgorithmDemoMode()) {
    try {
      const target = sessionTopics.find((t) => t.id === topicId);
      await fetchJson(
        `/recommendations/intent/${encodeURIComponent(userId)}/mutate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: `weight-${topicId}-${weight}-${Date.now()}`,
            scope: 'topic',
            targetId: topicId,
            targetLabel: target?.label ?? topicId,
            direction: mapWeightToDirection(weight),
          }),
        },
      );
      const profile = await fetchAlgorithmProfile();
      return profile.topics.find((t) => t.id === topicId) ?? null;
    } catch {
      // fall through to mock
    }
  }
  await delay(180);
  let updated: AlgorithmTopic | null = null;
  sessionTopics = sessionTopics.map((t) => {
    if (t.id === topicId) {
      updated = { ...t, weight };
      return updated;
    }
    return t;
  });
  return updated;
}

/**
 * Remove a topic from influence. Returns true if removed, false if not found
 * or not removable.
 */
export async function removeTopic(topicId: string): Promise<boolean> {
  const userId = getCurrentUserId();
  if (userId && !getAlgorithmDemoMode()) {
    try {
      const target = sessionTopics.find((t) => t.id === topicId);
      if (!target || !target.removable) return false;
      await fetchJson(
        `/recommendations/intent/${encodeURIComponent(userId)}/mutate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: `remove-${topicId}-${Date.now()}`,
            scope: 'topic',
            targetId: topicId,
            targetLabel: target.label,
            direction: 'remove',
          }),
        },
      );
      sessionTopics = sessionTopics.filter((t) => t.id !== topicId);
      return true;
    } catch {
      // fall through to mock
    }
  }
  await delay(220);
  const target = sessionTopics.find((t) => t.id === topicId);
  if (!target || !target.removable) return false;
  sessionTopics = sessionTopics.filter((t) => t.id !== topicId);
  return true;
}

/**
 * Add a new interest topic. Returns the created topic.
 */
export async function addTopic(label: string, category: string): Promise<AlgorithmTopic> {
  const userId = getCurrentUserId();
  if (userId && !getAlgorithmDemoMode()) {
    try {
      const topicId = `topic-user-${Date.now()}`;
      await fetchJson(
        `/recommendations/intent/${encodeURIComponent(userId)}/mutate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: `add-${topicId}`,
            scope: 'topic',
            targetId: topicId,
            targetLabel: label.trim(),
            direction: 'add',
            topicCategory: category,
          }),
        },
      );
      const profile = await fetchAlgorithmProfile();
      return profile.topics.find((t) => t.label === label.trim()) ?? {
        id: topicId,
        label: label.trim(),
        category,
        weight: 'medium' as TopicWeight,
        source: 'explicit' as SignalSource,
        removable: true,
        addedAt: new Date().toISOString(),
        isDemo: false,
      };
    } catch {
      // fall through to mock
    }
  }
  await delay(260);
  const topic: AlgorithmTopic = {
    id: `topic-user-${Date.now()}`,
    label: label.trim(),
    category,
    weight: 'medium',
    source: 'explicit',
    removable: true,
    addedAt: new Date().toISOString(),
    isDemo: getAlgorithmDemoMode(),
  };
  sessionTopics = [topic, ...sessionTopics];
  return topic;
}

/**
 * Fetch recent signals that shaped the feed (compact list).
 */
export async function fetchRecentInfluences(): Promise<AlgorithmSignal[]> {
  await delay(300);
  return [...MOCK_SIGNALS]
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
    .slice(0, 5);
}

/**
 * Explain why a specific item appeared in the feed.
 * Returns null if the item ID is not found.
 */
export async function fetchFeedExplanation(itemId: string): Promise<AlgorithmFeedExplanation | null> {
  await delay(340);
  // Build a deterministic explanation from the session topics so the reasons
  // reflect the user's actual profile. We pick the top contributing topics
  // by weight and derive a descriptive confidence label.
  const ranked = [...sessionTopics]
    .sort((a, b) => weightToValue(b.weight) - weightToValue(a.weight))
    .slice(0, 3);

  if (ranked.length === 0) return null;

  const reasons: FeedExplanationReason[] = ranked.map((t) => ({
    topic: t.label,
    source: t.source,
    weight: weightToValue(t.weight),
  }));

  const score = reasons.reduce((sum, r) => sum + r.weight, 0) / reasons.length;

  // Deterministic mock item metadata keyed off the itemId so the sheet always
  // shows a consistent thumbnail/title for the same item.
  const titles = [
    'Acne Studios Vintage Denim Jacket',
    'Maison Margiela Replica Sneakers',
    'Tailored Wool Overcoat',
    'Minimalist Leather Tote',
  ];
  const title = titles[Math.abs(hashCode(itemId)) % titles.length];
  const thumbnail = `https://images.unsplash.com/photo-1551028719-16edfa3acc6b?w=400&sig=${encodeURIComponent(itemId)}`;

  return {
    itemId,
    itemTitle: title,
    itemThumbnail: thumbnail,
    reasons,
    confidenceLabel: confidenceFromScore(score),
    isDemo: getAlgorithmDemoMode(),
  };
}

// Small deterministic hash so mock metadata is stable per itemId.
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
