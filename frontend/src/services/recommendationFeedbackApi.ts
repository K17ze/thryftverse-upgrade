/**
 * Recommendation Feedback API — real feed controls, not decoration.
 *
 * Wires the recommendation surface's negative-feedback actions to the two
 * backend mechanisms that actually shape ranking:
 *
 *  1. `POST /interactions` — records `not_interested` / `show_fewer` events.
 *     The decision service consumes them as signed negative profile signals
 *     (token-level down-weighting), and the API layer suppresses
 *     `not_interested` listings outright on every subsequent serve.
 *  2. `POST /recommendations/intent/:userId/mutate` — writes to the intent
 *     ledger (`source: 'feed_action'`). Item-scope `exclude` mutations remove
 *     the listing from future candidate sets; topic/category-scope `less`
 *     mutations become ranking directives that down-rank matching items.
 *
 * Both calls invalidate the recommendation cache epoch server-side, so the
 * next `/recommendations/:userId` response reflects the feedback.
 *
 * Per AGENTS.md §11 (Truthful UI): calls are best-effort but honest — a
 * failed write returns `persisted: false` so callers can keep the local
 * hide without claiming durable control. Guests (no user id) cannot persist
 * feedback; the local hide still applies for the session.
 */

import { fetchJson } from '../lib/apiClient';
import { useStore } from '../store/useStore';
import type { DiscoveryListingSummary } from '../contracts/DiscoveryListingSummary';

/** Actions the interaction stream accepts for feed control. */
export type FeedControlAction = 'not_interested' | 'show_fewer';

/** Serve attribution so feedback joins back to the logged impression. */
export interface FeedbackAttribution {
  /** Surface the item was served on, e.g. 'discover'. */
  surface?: string;
  /** Recommendation request id from the serve response. */
  requestId?: string | null;
  /** 1-based served position, when known. */
  position?: number;
  /** Serving model id, when known. */
  model?: string;
  /** Policy version, when known. */
  policyVersion?: string | null;
}

export interface FeedControlResult {
  /** True when at least one durable write reached the backend. */
  persisted: boolean;
}

function getCurrentUserId(): string | null {
  return useStore.getState().currentUser?.id ?? null;
}

function makeIdempotencyKey(prefix: string, listingId: string): string {
  return `${prefix}-${listingId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Record a raw interaction event. Returns false for guests or on failure —
 * never throws, so a feedback tap can degrade to a local-only hide.
 */
export async function postRecommendationInteraction(
  listingId: string,
  action: FeedControlAction,
  attribution: FeedbackAttribution = {},
): Promise<boolean> {
  const userId = getCurrentUserId();
  if (!userId) return false;
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
 *
 * Writes the `not_interested` interaction (hard exclusion in ranking plus a
 * negative token signal for similar items) and an item-scope `exclude`
 * intent mutation so the suppression survives cache epochs and sessions.
 */
export async function markItemNotInterested(
  listing: DiscoveryListingSummary,
  attribution: FeedbackAttribution = {},
): Promise<FeedControlResult> {
  const userId = getCurrentUserId();
  const interacted = await postRecommendationInteraction(listing.id, 'not_interested', attribution);
  if (!userId) return { persisted: false };
  const mutated = await postIntentMutation(userId, {
    idempotencyKey: makeIdempotencyKey('exclude-item', listing.id),
    scope: 'item',
    targetId: listing.id,
    targetLabel: listing.title || listing.id,
    direction: 'exclude',
    source: 'feed_action',
  });
  return { persisted: interacted || mutated };
}

/**
 * "Show less like this" — down-rank the item's dominant topic rather than
 * suppressing the listing outright (less ≠ never show).
 *
 * The interaction event contributes a decaying negative token signal for
 * similar items; the intent mutation records a `less` directive on the
 * item's category (falling back to brand) which the ranker applies as a
 * bounded utility penalty on matching candidates.
 */
export async function showFewerLikeThis(
  listing: DiscoveryListingSummary,
  attribution: FeedbackAttribution = {},
): Promise<FeedControlResult> {
  const userId = getCurrentUserId();
  const interacted = await postRecommendationInteraction(listing.id, 'show_fewer', attribution);
  if (!userId) return { persisted: false };

  // The "like this" axis: prefer the category (the facet the category bar
  // already exposes), then brand, then the raw title as last resort.
  const scope = listing.category?.trim() ? 'category' : listing.brand?.trim() ? 'brand' : 'item';
  const targetLabel =
    listing.category?.trim() || listing.brand?.trim() || listing.title || listing.id;
  const targetId =
    scope === 'item'
      ? listing.id
      : `${scope}-${targetLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

  const mutated = await postIntentMutation(userId, {
    idempotencyKey: makeIdempotencyKey('less', listing.id),
    scope,
    targetId,
    targetLabel,
    direction: 'less',
    source: 'feed_action',
  });
  return { persisted: interacted || mutated };
}
