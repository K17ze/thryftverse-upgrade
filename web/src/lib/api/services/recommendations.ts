/**
 * Recommendations service — web port of the mobile serve/feedback contract
 * (frontend/src/hooks/useForYouFeed.ts, services/recommendationFeedbackApi.ts,
 * services/algorithmTransparencyApi.ts).
 *
 * Backend routes (verified against backend/api/src/routes/recommendations.ts
 * and recommendationIntent.ts):
 *
 *  GET  /recommendations/:userId?surface&sessionId — server-ranked for-you
 *       serve; items carry score, policy, position, reasonCodes and
 *       componentScores plus the decision block (requestId, policyVersion,
 *       serveMode, coldStart).
 *  POST /interactions                            — `not_interested` /
 *       `show_fewer` events; consumed by ranking as negative signals, and
 *       `not_interested` suppresses the listing on subsequent serves.
 *  POST /recommendations/intent/:userId/mutate   — durable intent-ledger
 *       writes (item exclude/usual, brand/category less) keyed by
 *       idempotencyKey; invalidates the recommendation cache epoch.
 *  POST /recommendations/impressions             — client-confirmed
 *       exposure (served → rendered → viewable, forward-only).
 *  GET  /recommendations/intent/:userId/profile  — the user's intent topics
 *       (drives dynamic signal chips).
 *
 * Honesty rule (same as mobile §11): feedback writes are best-effort and
 * report `persisted`/`failure` truthfully — callers keep the local hide but
 * must not claim durable control that never landed.
 */

import { fetchJson } from '../http';
import {
  mapBackendListingToListing,
  type BackendListingRow,
} from '../mappers';
import {
  mapListingToDiscoverySummary,
  type DiscoveryListingSummary,
} from '@/lib/contracts/domain';

// ---------------------------------------------------------------------------
// Serve
// ---------------------------------------------------------------------------

export type ServeMode =
  | 'personalized'
  | 'cold_start'
  | 'non_profiled'
  | 'degraded_baseline'
  | 'recovery_general';

export interface RecommendedItem {
  listing: DiscoveryListingSummary;
  score: number;
  model: string;
  policy: 'exploit' | 'explore';
  /** 1-based served position. */
  position: number;
  reasonCodes: string[];
  componentScores: Record<string, number>;
}

export interface RecommendationsPage {
  items: RecommendedItem[];
  /** Serve correlation id — joins interactions/impressions to this serve. */
  requestId: string | null;
  serveMode: ServeMode | null;
  policyVersion: string | null;
  intentVersion: number | null;
  trainedModel: boolean;
  /** 'decision_service' | 'cache' | 'fallback' | other backend strings. */
  source: string | null;
  coldStart: boolean;
}

interface BackendRecommendationItem {
  listing?: BackendListingRow;
  score?: number;
  model?: string;
  policy?: 'exploit' | 'explore' | string;
  position?: number;
  reasonCodes?: string[];
  componentScores?: Record<string, number>;
}

interface BackendRecommendationsResponse {
  source?: string;
  serveMode?: string;
  intentVersion?: number;
  decision?: {
    requestId?: string;
    policyVersion?: string;
    featureSchemaVersion?: string;
    capabilityLevel?: string;
    trainedModel?: boolean;
    generatedAt?: string;
    explorationRate?: number;
    coldStart?: boolean;
  };
  items?: BackendRecommendationItem[];
}

export async function fetchForYouRecommendations(
  userId: string,
  options: { surface?: string; sessionId?: string; signal?: AbortSignal } = {},
): Promise<RecommendationsPage> {
  const params = new URLSearchParams();
  params.set('surface', options.surface ?? 'home_feed');
  if (options.sessionId) params.set('sessionId', options.sessionId);
  const payload = await fetchJson<BackendRecommendationsResponse>(
    `/recommendations/${encodeURIComponent(userId)}?${params.toString()}`,
    undefined,
    { signal: options.signal },
  );

  const items: RecommendedItem[] = [];
  for (const item of payload.items ?? []) {
    if (!item.listing) continue;
    const mapped = mapBackendListingToListing(item.listing);
    if (!mapped) continue;
    items.push({
      listing: mapListingToDiscoverySummary(mapped),
      score: typeof item.score === 'number' ? item.score : 0,
      model: typeof item.model === 'string' ? item.model : '',
      policy: item.policy === 'exploit' ? 'exploit' : 'explore',
      position: typeof item.position === 'number' ? item.position : items.length + 1,
      reasonCodes: Array.isArray(item.reasonCodes)
        ? item.reasonCodes.filter((c): c is string => typeof c === 'string')
        : [],
      componentScores:
        item.componentScores && typeof item.componentScores === 'object'
          ? item.componentScores
          : {},
    });
  }

  const decision = payload.decision;
  return {
    items,
    requestId: typeof decision?.requestId === 'string' ? decision.requestId : null,
    serveMode: (payload.serveMode as ServeMode | undefined) ?? null,
    policyVersion:
      typeof decision?.policyVersion === 'string' ? decision.policyVersion : null,
    intentVersion:
      typeof payload.intentVersion === 'number' ? payload.intentVersion : null,
    trainedModel: decision?.trainedModel === true,
    source: typeof payload.source === 'string' ? payload.source : null,
    coldStart: decision?.coldStart === true,
  };
}

// ---------------------------------------------------------------------------
// Impression confirmation
// ---------------------------------------------------------------------------

export type ImpressionStatus = 'rendered' | 'viewable';

export interface ImpressionEntry {
  listingId: string;
  status: ImpressionStatus;
  viewability?: Record<string, unknown>;
}

/** Best-effort impression confirmation — never throws (mirrors mobile). */
export async function confirmRecommendationImpressions(
  requestId: string,
  entries: ImpressionEntry[],
): Promise<boolean> {
  if (!requestId || entries.length === 0) return false;
  try {
    await fetchJson(
      '/recommendations/impressions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, entries }),
      },
      { maxRetries: 1, timeoutMs: 8000 },
    );
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Feed controls — negative feedback writes (port of recommendationFeedbackApi)
// ---------------------------------------------------------------------------

export type FeedControlAction = 'not_interested' | 'show_fewer';

/** Serve attribution so a feedback write joins back to the logged impression. */
export interface FeedbackAttribution {
  surface?: string;
  requestId?: string | null;
  position?: number;
  model?: string;
  policyVersion?: string | null;
}

export interface FeedControlResult {
  /** True when at least one durable write reached the backend. */
  persisted: boolean;
  /**
   * Only present when `persisted` is false.
   * 'anonymous':    no signed-in user — retry can never succeed; the choice
   *                 is session-local and the UI must say so.
   * 'unavailable':  the write failed (network/server) — a retry may succeed.
   * 'fixture_mode': no backend exists in this build — the choice is a real
   *                 local control, not a server preference.
   */
  failure?: 'anonymous' | 'unavailable' | 'fixture_mode';
}

function makeIdempotencyKey(prefix: string, listingId: string): string {
  return `${prefix}-${listingId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Record a raw interaction event. Never throws — a feedback tap degrades
 *  to a local-only hide. `metadata` lands verbatim on the interactions +
 *  recommendation_feedback rows (backend schema: `z.record(z.unknown())`),
 *  so the follow-up reason is durable signal, not decoration. */
async function postRecommendationInteraction(
  userId: string,
  listingId: string,
  action: FeedControlAction,
  attribution: FeedbackAttribution,
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  try {
    await fetchJson('/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        listingId,
        action,
        strength: 1,
        idempotencyKey: makeIdempotencyKey(action, listingId),
        requestId: attribution.requestId ?? undefined,
        position: attribution.position,
        model: attribution.model,
        policyVersion: attribution.policyVersion ?? undefined,
        surface: attribution.surface,
        metadata: metadata ?? undefined,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

async function postIntentMutation(
  userId: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  try {
    await fetchJson(`/recommendations/intent/${encodeURIComponent(userId)}/mutate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * "Not interested" — suppress this listing now and going forward.
 * Writes the `not_interested` interaction plus an item-scope `exclude`
 * intent mutation so the suppression survives cache epochs and sessions.
 *
 * When the follow-up `reason` is known it rides on the interaction's
 * metadata; a 'not_my_style' reason additionally writes a `less` intent
 * mutation on the item's brand (category fallback) so similar pieces
 * genuinely down-rank on the next serve — the reason is real ranking
 * input, not a survey answer dropped on the floor. 'seen_it',
 * 'wrong_size' and 'too_expensive' have no honest facet scope in the
 * intent contract (no size/price scopes exist), so they stay metadata.
 */
export async function markItemNotInterested(
  userId: string | null,
  listing: DiscoveryListingSummary,
  attribution: FeedbackAttribution = {},
  reason?: string,
): Promise<FeedControlResult> {
  if (!userId) return { persisted: false, failure: 'anonymous' };
  const interacted = await postRecommendationInteraction(
    userId,
    listing.id,
    'not_interested',
    attribution,
    reason ? { reason } : undefined,
  );
  const mutated = await postIntentMutation(userId, {
    idempotencyKey: makeIdempotencyKey('exclude-item', listing.id),
    scope: 'item',
    targetId: listing.id,
    targetLabel: listing.title || listing.id,
    direction: 'exclude',
    source: 'feed_action',
  });
  let dampened = false;
  if (reason === 'not_my_style') {
    const facetScope = listing.brand?.trim() ? 'brand' : 'category';
    const targetLabel =
      (facetScope === 'brand' ? listing.brand : listing.category)?.trim() || '';
    if (targetLabel) {
      dampened = await postIntentMutation(userId, {
        idempotencyKey: makeIdempotencyKey('reason-less', listing.id),
        scope: facetScope,
        targetId: `${facetScope}-${targetLabel
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')}`,
        targetLabel,
        direction: 'less',
        source: 'feed_action',
      });
    }
  }
  return interacted || mutated || dampened
    ? { persisted: true }
    : { persisted: false, failure: 'unavailable' };
}

/** The facet a feed-level tune action binds to — category first (the
 *  "topic" the explanation reasons cite), then brand, then the item
 *  itself when no facet exists. Shared by the more/less/remove writes so
 *  all three target the same durable key. */
function dominantFacet(listing: DiscoveryListingSummary): {
  scope: 'category' | 'brand' | 'item';
  targetId: string;
  targetLabel: string;
} {
  const scope = listing.category?.trim()
    ? ('category' as const)
    : listing.brand?.trim()
      ? ('brand' as const)
      : ('item' as const);
  const targetLabel =
    listing.category?.trim() || listing.brand?.trim() || listing.title || listing.id;
  const targetId =
    scope === 'item'
      ? listing.id
      : `${scope}-${targetLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  return { scope, targetId, targetLabel };
}

/**
 * "Show less like this" — down-rank the item's dominant facet rather than
 * suppressing the listing. The interaction is a decaying negative token
 * signal; the intent mutation records a `less` directive on the item's
 * category (falling back to brand, then the item itself).
 */
export async function showFewerLikeThis(
  userId: string | null,
  listing: DiscoveryListingSummary,
  attribution: FeedbackAttribution = {},
): Promise<FeedControlResult> {
  if (!userId) return { persisted: false, failure: 'anonymous' };
  const interacted = await postRecommendationInteraction(
    userId, listing.id, 'show_fewer', attribution,
  );

  const facet = dominantFacet(listing);
  const mutated = await postIntentMutation(userId, {
    idempotencyKey: makeIdempotencyKey('less', listing.id),
    ...facet,
    direction: 'less',
    source: 'feed_action',
  });
  return interacted || mutated
    ? { persisted: true }
    : { persisted: false, failure: 'unavailable' };
}

/**
 * "See more like this" — the positive counterpart of showFewerLikeThis
 * (mobile FeedExplanationSheet → updateTopicWeight(topicId, 'high')). The
 * interactions contract has no positive event type, so the durable
 * channel is the intent ledger alone: a `more` directive on the item's
 * dominant facet. The serve path reads it as a real ranking directive
 * (recommendations.ts: brand/category/item `more` mutations push a
 * `band: 'more'` topic directive to the decision service) and a later
 * `usual`/`less` mutation on the same target reverses it — same
 * latest-mutation-wins semantics as the negative writes.
 */
export async function showMoreLikeThis(
  userId: string | null,
  listing: DiscoveryListingSummary,
): Promise<FeedControlResult> {
  if (!userId) return { persisted: false, failure: 'anonymous' };
  const facet = dominantFacet(listing);
  const mutated = await postIntentMutation(userId, {
    idempotencyKey: makeIdempotencyKey('more', listing.id),
    ...facet,
    direction: 'more',
    source: 'feed_action',
  });
  return mutated
    ? { persisted: true }
    : { persisted: false, failure: 'unavailable' };
}

/**
 * "Remove this topic" — durable exclusion of the item's dominant facet
 * (mobile FeedExplanationSheet → removeTopic). On the backend a `remove`
 * mutation on a brand/category scope resolves to an `excluded` topic
 * directive — the facet stops shaping the serve entirely, not just
 * down-ranking; on the item scope it suppresses the listing itself.
 * Reversible: the ledger is latest-per-(scope,target), so a `usual` or
 * `add` mutation on the same target lifts the exclusion.
 */
export async function removeFeedTopic(
  userId: string | null,
  listing: DiscoveryListingSummary,
): Promise<FeedControlResult> {
  if (!userId) return { persisted: false, failure: 'anonymous' };
  const facet = dominantFacet(listing);
  const mutated = await postIntentMutation(userId, {
    idempotencyKey: makeIdempotencyKey('remove-topic', listing.id),
    ...facet,
    direction: 'remove',
    source: 'feed_action',
  });
  return mutated
    ? { persisted: true }
    : { persisted: false, failure: 'unavailable' };
}

/**
 * Undo "not interested" — compensating write for a landed exclusion. The
 * intent ledger is append-only and latest-per-(scope, target) wins, so an
 * item-scope `usual` lifts a previous `exclude` on the same listing (the
 * backend also retracts the interaction-derived exclusion, S21-03).
 */
export async function undoItemNotInterested(
  userId: string | null,
  listing: DiscoveryListingSummary,
): Promise<FeedControlResult> {
  if (!userId) return { persisted: false, failure: 'anonymous' };
  const mutated = await postIntentMutation(userId, {
    idempotencyKey: makeIdempotencyKey('undo-exclude-item', listing.id),
    scope: 'item',
    targetId: listing.id,
    targetLabel: listing.title || listing.id,
    direction: 'usual',
    source: 'feed_action',
  });
  return mutated
    ? { persisted: true }
    : { persisted: false, failure: 'unavailable' };
}

// ---------------------------------------------------------------------------
// Intent profile — drives dynamic signal chips
// ---------------------------------------------------------------------------

export interface IntentTopic {
  id: string;
  label: string;
  category: string;
  /** 'more' | 'less' | 'excluded' | neutral band strings from the backend. */
  influenceBand: string;
  sourceType: string;
  removable: boolean;
}

interface BackendIntentProfile {
  intentVersion?: number;
  profileMode?: string;
  topics?: Array<{
    id?: string;
    label?: string;
    category?: string;
    influenceBand?: string;
    sourceType?: string;
    removable?: boolean;
  }>;
}

/** The user's intent-ledger topics. Returns null when unreachable — callers
 *  treat that as "no profile signals", never fabricate topics. */
export async function fetchIntentTopics(
  userId: string,
  signal?: AbortSignal,
): Promise<IntentTopic[] | null> {
  try {
    const payload = await fetchJson<BackendIntentProfile>(
      `/recommendations/intent/${encodeURIComponent(userId)}/profile`,
      undefined,
      { signal },
    );
    return (payload.topics ?? [])
      .filter((t): t is NonNullable<typeof t> & { id: string; label: string } =>
        typeof t?.id === 'string' && typeof t?.label === 'string',
      )
      .map((t) => ({
        id: t.id,
        label: t.label,
        category: typeof t.category === 'string' ? t.category : '',
        influenceBand: typeof t.influenceBand === 'string' ? t.influenceBand : 'usual',
        sourceType: typeof t.sourceType === 'string' ? t.sourceType : 'inferred',
        removable: t.removable !== false,
      }));
  } catch {
    return null;
  }
}
