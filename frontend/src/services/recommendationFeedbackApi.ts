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
 *
 * IDENTITY BINDING (S21-03): delayed writes — undo-window timers, unmount
 * flushes, retries — run under the account captured at action time via the
 * `FeedbackActor` parameter. If the session signs out or switches inside
 * the grace window, the write is dropped honestly (a metric is recorded);
 * it is never attributed to the now-current account.
 *
 * Backend companion (separate repair): the API will add authoritative
 * exclusion retraction for the `usual` direction so a late Undo fully
 * reverses the `not_interested` interaction exclusion — until then the
 * undo write remains best-effort compensation, as documented below.
 */

import { fetchJson } from '../lib/apiClient';
import { useStore } from '../store/useStore';
import { trackRaw } from '../analytics';
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

/**
 * The account a feed-control choice belongs to, captured at action time.
 * Callers that delay the durable write (undo windows, flush-on-unmount,
 * retry) MUST pass this — the write binds to `actor.userId` or drops; it
 * never re-resolves "current user" at execution time.
 */
export interface FeedbackActor {
  /** Signed-in user id at the moment the choice was made. Null = guest. */
  userId: string | null;
}

export interface FeedControlResult {
  /** True when at least one durable write reached the backend. */
  persisted: boolean;
  /**
   * Why nothing persisted — only present when `persisted` is false.
   * 'anonymous': no signed-in user, so retry can never succeed; the hide is
   * session-local and the UI must say so rather than offer a dead retry.
   * 'unavailable': the write failed (network/server) — a retry may succeed.
   * 'identity_changed': the session signed out or switched accounts between
   * the action and the delayed write — the choice was dropped rather than
   * attributed to the wrong account (S21-03).
   */
  failure?: 'anonymous' | 'unavailable' | 'identity_changed';
}

function getCurrentUserId(): string | null {
  return useStore.getState().currentUser?.id ?? null;
}

function makeIdempotencyKey(prefix: string, listingId: string): string {
  return `${prefix}-${listingId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Resolves the user id a feedback write must run under.
 *
 * No actor (immediate actions): the live session is the actor — resolve it.
 * Actor with a captured id: the write runs under that id ONLY while the
 * session still belongs to it. On sign-out or account switch the request
 * would carry the NEW session's auth token; submitting the captured userId
 * under someone else's token misattributes the choice, so the write drops
 * honestly and a metric is recorded instead.
 *
 * (Replaying the action-time access token was rejected: fetchJson's 401
 * path retries with the live session's refreshed token, which would
 * silently re-attribute the write if the captured token had expired.)
 *
 * Returns `dropped: true` when the write must not be attempted.
 */
function resolveActorUserId(
  actor: FeedbackActor | undefined,
  action: FeedControlAction | 'undo_not_interested',
  listingId: string,
): { userId: string | null; dropped: boolean } {
  if (!actor) return { userId: getCurrentUserId(), dropped: false };
  if (!actor.userId) {
    // The choice was made anonymously — it cannot be persisted to any
    // account, including one signed in during the grace window.
    return { userId: null, dropped: false };
  }
  if (getCurrentUserId() === actor.userId) {
    return { userId: actor.userId, dropped: false };
  }
  trackRaw('feed_feedback_dropped', {
    reason: 'identity_changed',
    action,
    listing_id: listingId,
  });
  return { userId: null, dropped: true };
}

/**
 * Record a raw interaction event. Returns false for guests or on failure —
 * never throws, so a feedback tap can degrade to a local-only hide.
 */
async function postRecommendationInteraction(
  userId: string | null,
  listingId: string,
  action: FeedControlAction,
  attribution: FeedbackAttribution = {},
): Promise<boolean> {
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
 *
 * Pass `actor` (the account captured at hide-time) when the call is delayed
 * past the user's tap — undo-window timers, unmount flushes, retries.
 */
export async function markItemNotInterested(
  listing: DiscoveryListingSummary,
  attribution: FeedbackAttribution = {},
  actor?: FeedbackActor,
): Promise<FeedControlResult> {
  const { userId, dropped } = resolveActorUserId(actor, 'not_interested', listing.id);
  if (dropped) return { persisted: false, failure: 'identity_changed' };
  const interacted = await postRecommendationInteraction(userId, listing.id, 'not_interested', attribution);
  if (!userId) return { persisted: false, failure: 'anonymous' };
  const mutated = await postIntentMutation(userId, {
    idempotencyKey: makeIdempotencyKey('exclude-item', listing.id),
    scope: 'item',
    targetId: listing.id,
    targetLabel: listing.title || listing.id,
    direction: 'exclude',
    source: 'feed_action',
  });
  return interacted || mutated
    ? { persisted: true }
    : { persisted: false, failure: 'unavailable' };
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
  actor?: FeedbackActor,
): Promise<FeedControlResult> {
  const { userId, dropped } = resolveActorUserId(actor, 'show_fewer', listing.id);
  if (dropped) return { persisted: false, failure: 'identity_changed' };
  const interacted = await postRecommendationInteraction(userId, listing.id, 'show_fewer', attribution);
  if (!userId) return { persisted: false, failure: 'anonymous' };

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
  return interacted || mutated
    ? { persisted: true }
    : { persisted: false, failure: 'unavailable' };
}

/**
 * Undo a "not interested" — the compensating write for a landed exclusion.
 *
 * The intent ledger is append-only and latest-per-(scope, target) wins, so
 * an item-scope `usual` mutation lifts a previous `exclude` on the same
 * listing. Honest limit until the backend repair lands: the logged
 * `not_interested` interaction also feeds `excludedListingIds` — the backend
 * change (S21-03) makes `usual` retract that exclusion authoritatively, so
 * callers should still treat this as best-effort reversal today.
 */
export async function undoItemNotInterested(
  listing: DiscoveryListingSummary,
  actor?: FeedbackActor,
): Promise<FeedControlResult> {
  const { userId, dropped } = resolveActorUserId(actor, 'undo_not_interested', listing.id);
  if (dropped) return { persisted: false, failure: 'identity_changed' };
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
