import React from 'react';
import { useStore } from '../store/useStore';
import { fetchJson } from '../lib/apiClient';
import { mapBackendListingToListing, isDisplayReadyListing, type BackendListingRow } from '../services/listingMapper';
import type { Listing } from '../domain';
import type {
  RecommendationItemVM,
  RecommendationPage,
  ServeMode,
  ImpressionEntry,
} from '../domain/recommendation';
import { deriveScoreBand, deriveServeMode } from '../domain/recommendation';

interface BackendRecommendationItem {
  listing: BackendListingRow;
  score: number;
  model: string;
  policy: 'exploit' | 'explore';
  position: number;
  reasonCodes: string[];
  componentScores: Record<string, number>;
}

interface BackendRecommendationsResponse {
  source: 'decision_service' | 'cache' | 'fallback' | string;
  serveMode?: string;
  intentVersion?: number;
  decision: {
    requestId: string;
    policyVersion: string;
    featureSchemaVersion: string;
    capabilityLevel: string;
    trainedModel: boolean;
    generatedAt: string;
    explorationRate: number;
    coldStart: boolean;
    diagnostics: Record<string, unknown>;
  };
  items: BackendRecommendationItem[];
}

interface ForYouFeedState {
  items: RecommendationItemVM[];
  listings: Listing[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  /** Refresh failure on a populated feed — the last-good page stays on
   *  screen and the surface renders an inline retry note instead of
   *  swapping the feed for a full error state (FRESH-02). `error` remains
   *  the initial-load / no-content channel. */
  refreshError: string | null;
  serveMode: ServeMode | null;
  requestId: string | null;
  sessionId: string;
  intentVersion: number | null;
  trainedModel: boolean;
  policyVersion: string | null;
  refresh: () => Promise<void>;
  confirmImpressions: (entries: ImpressionEntry[]) => Promise<void>;
  /** Remove a listing from the currently served page (e.g. after the user
   *  marks it "not interested") so the suppression is visible immediately,
   *  ahead of the next server-side serve. */
  dismissListing: (listingId: string) => void;
}

function generateSessionId(): string {
  const bytes = new Uint8Array(8);
  const globalCrypto = (globalThis as unknown as {
    crypto?: { getRandomValues?: (arr: Uint8Array) => Uint8Array };
  }).crypto;
  if (typeof globalCrypto?.getRandomValues === 'function') {
    globalCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function mapResponseToPage(
  payload: BackendRecommendationsResponse,
  sessionId: string,
  surface: string,
): RecommendationPage {
  const { decision, source, serveMode: explicitServeMode, intentVersion: explicitIntentVersion } = payload;
  const serveMode = (explicitServeMode as ServeMode) ?? deriveServeMode(source, decision.coldStart);

  const items: RecommendationItemVM[] = payload.items.flatMap((item) => {
    const listing = mapBackendListingToListing(item.listing);
    if (!isDisplayReadyListing(listing)) return [];

    return [{
      listing,
      score: item.score,
      scoreBand: deriveScoreBand(item.score, item.policy),
      model: item.model,
      policy: item.policy,
      position: item.position,
      reasonCodes: item.reasonCodes,
      componentScores: item.componentScores,
      candidateSources: [{
        source: 'recent_sql_keyset',
        sourceRank: item.position,
        sourceScore: item.score,
        retrievalVersion: 'v1',
      }],
      selectionPropensity: null,
      explanationToken: null,
    }];
  });

  return {
    requestId: decision.requestId,
    sessionId,
    surface,
    serveMode,
    policyVersion: decision.policyVersion,
    featureSchemaVersion: decision.featureSchemaVersion,
    trainedModel: decision.trainedModel,
    capabilityLevel: decision.capabilityLevel,
    generatedAt: decision.generatedAt,
    explorationRate: decision.explorationRate,
    intentVersion: explicitIntentVersion ?? 0,
    items,
  };
}

export function useForYouFeed(surface: string = 'home'): ForYouFeedState {
  const currentUser = useStore((s) => s.currentUser);
  const [page, setPage] = React.useState<RecommendationPage | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshError, setRefreshError] = React.useState<string | null>(null);

  const userId = currentUser?.id ?? null;
  const sessionIdRef = React.useRef(generateSessionId());

  // ── Request identity (FRESH-02) ──
  // Monotonic epoch bumped whenever the feed identity (signed-in user +
  // surface) changes. Both the initial fetch and pull-to-refresh capture
  // the epoch that issued them; any async write landing after the epoch
  // has moved on is discarded, so a slow response from a previous identity
  // can never clobber the new identity's page or error state.
  const feedEpochRef = React.useRef(0);
  // Same-identity serialization (P2): the epoch only guards CROSS-identity
  // staleness — two overlapping loads for the SAME identity both pass the
  // epoch check, so whichever resolves last wins and the earlier finally
  // can clear isRefreshing under the newer request. A second load issued
  // while one is already in flight for this identity is skipped: the
  // in-flight response is at least as fresh as what a duplicate would
  // return, and skipping removes the last-writer-wins window entirely.
  const inFlightEpochRef = React.useRef<number | null>(null);
  // Latest committed page, readable inside the stable load callback —
  // decides whether a refresh failure keeps last-good content (inline
  // `refreshError`) or is a no-content failure (`error` channel).
  const pageRef = React.useRef<RecommendationPage | null>(null);
  React.useEffect(() => {
    pageRef.current = page;
  }, [page]);

  // Identity change is the ONLY place the cached page is cleared: the old
  // page belongs to a different user/surface and must not linger. Declared
  // before the load effect so the epoch bump lands before the new fetch.
  React.useEffect(() => {
    feedEpochRef.current += 1;
    setPage(null);
    setError(null);
    setRefreshError(null);
    // Any in-flight request is now a dead epoch — its finally is guarded,
    // so the pending flags are released here instead of leaking.
    setIsLoading(false);
    setIsRefreshing(false);
  }, [userId, surface]);

  const loadForYouFeed = React.useCallback(
    async (isRefresh: boolean) => {
      const epoch = feedEpochRef.current;
      if (!userId) {
        setPage(null);
        setError(null);
        setRefreshError(null);
        return;
      }
      // A load for this identity is already in flight — a duplicate would
      // only reopen the last-writer-wins window. Skip it.
      if (inFlightEpochRef.current === epoch) return;
      inFlightEpochRef.current = epoch;

      if (isRefresh) {
        setIsRefreshing(true);
        setRefreshError(null);
      } else {
        setIsLoading(true);
        setError(null);
      }

      try {
        const payload = await fetchJson<BackendRecommendationsResponse>(
          `/recommendations/${encodeURIComponent(userId)}?surface=${encodeURIComponent(surface)}&sessionId=${encodeURIComponent(sessionIdRef.current)}`
        );

        // A response that lands after the identity moved on belongs to a
        // dead request — drop it rather than clobbering the new identity's
        // state.
        if (epoch !== feedEpochRef.current) return;

        const mapped = mapResponseToPage(payload, sessionIdRef.current, surface);
        setPage(mapped);
        setError(null);
        setRefreshError(null);
      } catch (err) {
        if (epoch !== feedEpochRef.current) return;
        const message = err instanceof Error ? err.message : 'Failed to load recommendations';
        // FRESH-02: a failed refresh on a populated feed keeps the
        // last-good page on screen — the failure surfaces as a distinct
        // inline `refreshError`, never a blanked feed. With no cached
        // content the failure is a no-content error state instead.
        if (isRefresh && pageRef.current) {
          setRefreshError(message);
        } else {
          setError(message);
        }
      } finally {
        // Release the in-flight slot before the epoch check — the slot is
        // only cleared by the request that holds it, so a dead-epoch
        // request can never free a newer identity's slot.
        if (inFlightEpochRef.current === epoch) inFlightEpochRef.current = null;
        if (epoch !== feedEpochRef.current) return;
        if (isRefresh) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [userId, surface]
  );

  React.useEffect(() => {
    void loadForYouFeed(false);
  }, [loadForYouFeed]);

  const refresh = React.useCallback(() => loadForYouFeed(true), [loadForYouFeed]);

  const confirmImpressions = React.useCallback(
    async (entries: ImpressionEntry[]) => {
      const currentRequestId = page?.requestId;
      if (!currentRequestId || entries.length === 0) return;

      try {
        await fetchJson(
          '/recommendations/impressions',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requestId: currentRequestId,
              entries,
            }),
          },
          { maxRetries: 1, timeoutMs: 8000 }
        );
      } catch {
        // Best-effort: viewability confirmation failure is non-fatal.
      }
    },
    [page?.requestId]
  );

  const dismissListing = React.useCallback((listingId: string) => {
    setPage((prev) =>
      prev
        ? { ...prev, items: prev.items.filter((vm) => vm.listing.id !== listingId) }
        : prev
    );
  }, []);

  const items = page?.items ?? [];
  const listings = React.useMemo(() => items.map((vm) => vm.listing), [items]);

  return {
    items,
    listings,
    isLoading,
    isRefreshing,
    error,
    refreshError,
    serveMode: page?.serveMode ?? null,
    requestId: page?.requestId ?? null,
    sessionId: sessionIdRef.current,
    intentVersion: page?.intentVersion ?? null,
    trainedModel: page?.trainedModel ?? false,
    policyVersion: page?.policyVersion ?? null,
    refresh,
    confirmImpressions,
    dismissListing,
  };
}
