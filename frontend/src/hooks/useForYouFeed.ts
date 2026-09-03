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
  serveMode: ServeMode | null;
  requestId: string | null;
  sessionId: string;
  intentVersion: number | null;
  trainedModel: boolean;
  policyVersion: string | null;
  refresh: () => Promise<void>;
  confirmImpressions: (entries: ImpressionEntry[]) => Promise<void>;
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

export function useForYouFeed(): ForYouFeedState {
  const currentUser = useStore((s) => s.currentUser);
  const [page, setPage] = React.useState<RecommendationPage | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const userId = currentUser?.id ?? null;
  const sessionIdRef = React.useRef(generateSessionId());

  const loadForYouFeed = React.useCallback(
    async (isRefresh: boolean) => {
      if (!userId) {
        setPage(null);
        setError(null);
        return;
      }

      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const payload = await fetchJson<BackendRecommendationsResponse>(
          `/recommendations/${encodeURIComponent(userId)}?surface=home&sessionId=${encodeURIComponent(sessionIdRef.current)}`
        );

        const mapped = mapResponseToPage(payload, sessionIdRef.current, 'home');
        setPage(mapped);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load recommendations';
        setError(message);
        setPage(null);
      } finally {
        if (isRefresh) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [userId]
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

  const items = page?.items ?? [];
  const listings = React.useMemo(() => items.map((vm) => vm.listing), [items]);

  return {
    items,
    listings,
    isLoading,
    isRefreshing,
    error,
    serveMode: page?.serveMode ?? null,
    requestId: page?.requestId ?? null,
    sessionId: sessionIdRef.current,
    intentVersion: page?.intentVersion ?? null,
    trainedModel: page?.trainedModel ?? false,
    policyVersion: page?.policyVersion ?? null,
    refresh,
    confirmImpressions,
  };
}
